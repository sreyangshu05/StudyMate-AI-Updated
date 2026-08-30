// PDF ingestion: validation (magic bytes), real per-page text extraction, and
// page-boundary-aware chunking.

// We reuse the pdf.js build bundled with pdf-parse to avoid extra dependencies,
// but drive it page-by-page so chunk-level page metadata reflects REAL page
// boundaries instead of a document-wide text ratio.

import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import crypto from 'crypto';
import { ProcessingError, ValidationError } from '../errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function loadPdfJs() {
  try {
    const pdfBuildPath = path.join(__dirname, '../../node_modules/pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
    const mod = require(pdfBuildPath);
    return mod;
  } catch (err) {
    // Some installs expose ./pdf.js directly; fall back gracefully.
    // eslint-disable-next-line no-shadow
    const pdfBuildPath = path.join(__dirname, '../../node_modules/pdf-parse/lib/pdf.js/pdf.js');
    return require(pdfBuildPath);
  }
}

const PDFJS = loadPdfJs();
PDFJS.disableWorker = true;

// PDF magic bytes: "%PDF-"
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

export class PDFService {
  constructor(uploadsDir) {
    this.uploadsDir = uploadsDir;
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  }

  // Validate a buffer is actually a PDF: extension + magic bytes. Never trust the
  // client's declared MIME type alone.
  static validatePdfBuffer(buffer, originalName = '') {
    if (!buffer || buffer.length < 8) {
      throw new ValidationError('Uploaded file is empty or too small');
    }

    const ext = path.extname(originalName || '').toLowerCase();
    if (ext && ext !== '.pdf') {
      throw new ValidationError('Only PDF files are allowed');
    }

    // Validate magic bytes within the first 1024 bytes (headers can be preceded by junk).
    const head = buffer.subarray(0, 1024);
    if (head.lastIndexOf(PDF_MAGIC) === -1) {
      throw new ValidationError('File is not a valid PDF (signature check failed)');
    }

    return true;
  }

  // Generate a safe, collision-resistant filename. Never trust the original name.
  static generateFilename(originalName) {
    const base = path.basename(originalName || 'document').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'document';
    const rand = crypto.randomBytes(6).toString('hex');
    return `${Date.now()}-${rand}-${base}.pdf`;
  }

  // Save a validated PDF buffer to disk. Returns { filename, filePath, originalName }.
  async save(buffer, originalName) {
    PDFService.validatePdfBuffer(buffer, originalName);
    const filename = PDFService.generateFilename(originalName);
    const filePath = path.join(this.uploadsDir, filename);

    // atomic-ish write
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, buffer);
    await fs.promises.rename(tempPath, filePath);

    return { filename, filePath, originalName: originalName || filename };
  }

  // Extract per-page text. Returns { pages: [{ pageNo, text }], numPages, totalChars }.
  async extractPages(filePath) {
    let buffer;
    try {
      buffer = await fs.promises.readFile(filePath);
    } catch {
      throw new ProcessingError('Could not read stored file');
    }

    PDFService.validatePdfBuffer(buffer, path.basename(filePath));

    let doc;
    try {
      doc = await PDFJS.getDocument({ data: buffer }).promise;
    } catch (err) {
      const fallback = await this.extractPagesFallback(buffer);
      if (fallback) return fallback;
      throw new ProcessingError(`Malformed PDF: ${err.message}`);
    }

    const numPages = doc.numPages;
    const pages = [];
    try {
      for (let i = 1; i <= numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // Place items using their x position on each line to approximate reading order.
        const lineMap = {};
        for (const item of content.items) {
          if (!item.str) continue;
          const y = Math.round(item.transform ? item.transform[5] * 100 : 0);
          (lineMap[y] = lineMap[y] || []).push(item.str);
        }
        const lines = Object.keys(lineMap)
          .sort((a, b) => Number(b) - Number(a)) // top-to-bottom
          .map((y) => lineMap[y].join(' '));
        pages.push({ pageNo: i, text: lines.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() });
      }
    } catch (err) {
      throw new ProcessingError(`Failed to extract PDF text: ${err.message}`);
    } finally {
      try { await doc.destroy(); } catch { /* best effort */ }
    }

    return { pages, numPages, totalChars: pages.reduce((s, p) => s + p.text.length, 0) };
  }

  // Lightweight parser for simple PDFs when pdf.js cannot recover.
  // This is intentionally conservative: it only kicks in after pdf.js fails and
  // is designed to preserve the READY pipeline for ordinary generated PDFs.
  async extractPagesFallback(buffer) {
    try {
      const text = buffer.toString('latin1');
      const pageRefs = [...text.matchAll(/(\d+)\s+\d+\s+obj\s*<<[\s\S]*?\/Type\s*\/Page\b[\s\S]*?\/Contents\s+(\d+)\s+\d+\s+R[\s\S]*?>>\s*endobj/gi)];
      if (pageRefs.length === 0) return null;

      const objects = new Map();
      for (const match of text.matchAll(/(\d+)\s+\d+\s+obj\s*([\s\S]*?)\s*endobj/gi)) {
        objects.set(Number(match[1]), match[2]);
      }

      const pages = [];
      for (let i = 0; i < pageRefs.length; i += 1) {
        const contentObj = Number(pageRefs[i][2]);
        const body = objects.get(contentObj);
        if (!body) continue;
        const streamMatch = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/i) || body.match(/stream\r?\n([\s\S]*)/i);
        if (!streamMatch) continue;

        let stream = Buffer.from(streamMatch[1], 'latin1');
        if (/\/FlateDecode/i.test(body)) {
          try { stream = zlib.inflateSync(stream); } catch { /* best effort */ }
        }

        const extracted = extractTextFromStream(stream.toString('latin1'));
        pages.push({ pageNo: pages.length + 1, text: extracted });
      }

      if (pages.length === 0) return null;
      return { pages, numPages: pages.length, totalChars: pages.reduce((s, p) => s + p.text.length, 0) };
    } catch {
      return null;
    }
  }

  // Chunk within page boundaries so a chunk never spans pages (where feasible).
  // chunkSize ≈ target words, overlap in words. Pages are handled independently,
  // keeping page metadata accurate.
  chunkByPage(pages, { chunkSize = 500, overlap = 100 } = {}) {
    const chunks = [];
    for (const page of pages) {
      const words = page.text.split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      const step = Math.max(1, chunkSize - overlap);
      for (let i = 0; i < words.length; i += step) {
        const slice = words.slice(i, i + chunkSize);
        if (slice.length === 0) continue;
        chunks.push({
          page_no: page.pageNo,
          text: slice.join(' ').trim(),
          chunk_id: chunks.length + 1,
          start_index: i,
        });
      }
    }
    return chunks;
  }
}

export default PDFService;

function extractTextFromStream(streamText) {
  const chunks = [];
  const textOp = /(\((?:\\.|[^\\)])*\)|\[[\s\S]*?\])\s*(Tj|TJ)/g;
  for (const match of streamText.matchAll(textOp)) {
    const raw = match[1];
    if (raw.startsWith('[')) {
      for (const inner of raw.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
        chunks.push(unescapePdfString(inner[0].slice(1, -1)));
      }
    } else {
      chunks.push(unescapePdfString(raw.slice(1, -1)));
    }
  }
  return chunks.join(' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function unescapePdfString(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\\/g, '\\')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')');
}
