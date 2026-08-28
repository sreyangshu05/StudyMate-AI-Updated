// Document lifecycle orchestration.
//   UPLOADING -> PROCESSING -> READY
//                    \-> FAILED
// Upload validates magic bytes, stores the file with a generated name, then
// async processing extracts per-page text and stores ownership-scoped
// embeddings. On any failure the row is marked FAILED (file kept for retry).
// This service is now driven by the in-process ingest queue (see ingestQueue.js).

import fs from 'fs';
import path from 'path';
import { PDFService } from './pdfService.js';
import { EmbeddingService } from './embeddingService.js';
import { getDatabase } from './database.js';
import { ProcessingError, NotFoundError, ConflictError } from '../errors.js';

export class DocumentService {
  constructor({ uploadsDir }) {
    this.uploadsDir = uploadsDir;
    this.pdfService = new PDFService(uploadsDir);
    this.embeddingService = new EmbeddingService();
  }

  // Step 1: persist the file + create the document row.
  // Returns the document record with status UPLOADING.
  async beginUpload({ userId, title, buffer, originalName }) {
    const { filename, filePath } = await this.pdfService.save(buffer, originalName);
    const db = getDatabase();
    const result = await db.run(
      'INSERT INTO documents (user_id, title, filename, file_path, status) VALUES (?, ?, ?, ?, ?)',
      [userId, title || originalName || filename, filename, filePath, 'UPLOADING']
    );
    const doc = await db.get('SELECT * FROM documents WHERE id = ?', [result.lastID]);
    return doc;
  }

  // Step 2: process the file (per-page extraction + embeddings).
  // Returns { document, chunks }.
  async processDocument(docId, userId) {
    const db = getDatabase();
    const doc = await db.get('SELECT * FROM documents WHERE id = ? AND user_id = ?', [docId, userId]);
    if (!doc) throw new NotFoundError('Document not found');
    if (doc.status === 'READY' && (doc.chunk_count || 0) > 0) {
      throw new ConflictError('Document is already processed');
    }

    await db.run("UPDATE documents SET status = 'PROCESSING', error = NULL WHERE id = ?", [docId]);

    const filePath = doc.file_path || path.join(this.uploadsDir, doc.filename);
    try {
      const { pages, numPages } = await this.pdfService.extractPages(filePath);
      const chunks = this.pdfService.chunkByPage(pages);

      // Store chunks + embeddings (scoped to owner).
      const stored = await this.embeddingService.storePassages(docId, userId, doc.title, chunks);

      // Capture page count from real extraction (not a ratio).
      await db.run(
        'UPDATE documents SET pages = ?, status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [numPages, 'READY', docId]
      );

      return { document: await db.get('SELECT * FROM documents WHERE id = ?', [docId]), chunks: stored };
    } catch (err) {
      // Mark failed but keep the file row so the user can retry or delete.
      await db.run("UPDATE documents SET status = 'FAILED', error = ? WHERE id = ?",
        [safe(err.message), docId]);
      throw err;
    }
  }

  // Recover a failed document (re-embeds).
  async retryProcess(docId, userId) {
    return this.processDocument(docId, userId);
  }

  // Complete deletion: verify ownership, remove passages (embeddings), remove
  // related quiz_documents links, soft-unlink the physical file, delete the row.
  async deleteDocument(docId, userId) {
    const db = getDatabase();
    const doc = await db.get('SELECT * FROM documents WHERE id = ? AND user_id = ?', [docId, userId]);
    if (!doc) throw new NotFoundError('Document not found');

    await this.embeddingService.deletePassagesForDoc(docId);

    // Remove any quizzes that reference this document.
    const quizIds = await db.all(
      `SELECT DISTINCT id FROM quizzes
       WHERE doc_id = ? OR id IN (SELECT quiz_id FROM quiz_documents WHERE doc_id = ?)`,
      [docId, docId]
    );
    for (const z of quizIds) {
      await db.run('DELETE FROM questions WHERE quiz_id = ?', [z.id]);
      await db.run('DELETE FROM attempts WHERE quiz_id = ?', [z.id]);
      await db.run('DELETE FROM quiz_documents WHERE quiz_id = ?', [z.id]);
    }
    await db.run('DELETE FROM quizzes WHERE doc_id = ? OR id IN (SELECT quiz_id FROM quiz_documents WHERE doc_id = ?)', [docId, docId]);
    await db.run('DELETE FROM documents WHERE id = ?', [docId]);

    // Best-effort physical file removal (idempotent).
    const candidates = [doc.file_path, path.join(this.uploadsDir, doc.filename)];
    for (const p of candidates) {
      if (p) {
        try { if (fs.existsSync(p)) await fs.promises.unlink(p); } catch { /* best effort */ }
      }
    }
    return { deleted: true };
  }
}

function safe(msg) {
  return typeof msg === 'string' ? msg.slice(0, 500) : 'Unknown error';
}

export default DocumentService;
