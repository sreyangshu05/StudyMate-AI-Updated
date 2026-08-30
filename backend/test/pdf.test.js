// PDF service tests: magic-byte validation, safe filename generation, atomic
// save, and REAL per-page text extraction with page-boundary-aware chunking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import { makeMultiPagePdf } from './pdfgen.js';

const root = mkdtempSync(path.join(os.tmpdir(), 'studymate-pdf-'));
const uploads = path.join(root, 'uploads');
mkdirSync(uploads, { recursive: true });

import { PDFService } from '../src/services/pdfService.js';
const svc = new PDFService(uploads);

test('rejects non-PDF by extension', () => {
  assert.throws(() => PDFService.validatePdfBuffer(Buffer.from('hello, longer than eight bytes'), 'x.txt'), /Only PDF/i);
});

test('rejects too-small buffer', () => {
  assert.throws(() => PDFService.validatePdfBuffer(Buffer.from('hi'), 'a.pdf'), /empty or too small/i);
});

test('rejects arbitrary bytes that are not PDF', () => {
  // valid .pdf extension but no magic bytes
  assert.throws(() => PDFService.validatePdfBuffer(Buffer.from('%NOTAPDF'.padEnd(20, 'X')), 'a.pdf'), /not a valid PDF/i);
});

test('accepts PDF magic bytes', () => {
  assert.equal(PDFService.validatePdfBuffer(Buffer.from('%PDF-1.7\nwhatever'), 'a.pdf'), true);
});

test('generateFilename strips unsafe chars and never trusts original', () => {
  const f1 = PDFService.generateFilename('../../etc/passwd');
  assert.ok(!f1.includes('/'));
  assert.ok(!f1.includes('..'));
  assert.ok(f1.endsWith('.pdf'));
  const f2 = PDFService.generateFilename('My Doc (final) — v2!.pdf');
  assert.ok(!/[^A-Za-z0-9._-]/.test(f2.replace(/^\d+-[0-9a-f]+-/, '').replace(/\.pdf$/, '')));
});

test('save writes atomically and returns file path', async () => {
  const buf = await makeMultiPagePdf(['P1 Alpha', 'P2 Beta', 'P3 Gamma']);
  const { filename, filePath } = await svc.save(buf, 'multi.pdf');
  assert.equal(path.basename(filePath), filename);
  const { existsSync } = await import('fs');
  assert.ok(existsSync(filePath));
});

test('extractPages returns correct per-page text (REAL page boundaries)', async () => {
  const buf = await makeMultiPagePdf(['Newton Second Law', 'Energy Conservation', 'Thermodynamics']);
  const { filePath } = await svc.save(buf, 'physics.pdf');
  const { pages, numPages } = await svc.extractPages(filePath);
  assert.equal(numPages, 3);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].pageNo, 1);
  assert.equal(pages[1].pageNo, 2);
  assert.equal(pages[2].pageNo, 3);
  assert.match(pages[0].text, /Newton/i);
  assert.match(pages[1].text, /Energy/i);
  assert.match(pages[2].text, /Thermodynamics/i);
});

test('chunkByPage does not cross page boundaries', async () => {
  const buf = await makeMultiPagePdf(['EqualToPageOne', 'EqualToPageTwo', 'EqualToPageThree']);
  const { filePath } = await svc.save(buf, 'chunk.pdf');
  const { pages } = await svc.extractPages(filePath);
  const chunks = svc.chunkByPage(pages, { chunkSize: 100, overlap: 0 });
  assert.equal(chunks.length, 3);
  for (let i = 0; i < chunks.length; i += 1) {
    assert.equal(chunks[i].page_no, i + 1);
  }
  assert.match(chunks[0].text, /EqualToPageOne/);
  assert.match(chunks[1].text, /EqualToPageTwo/);
  assert.match(chunks[2].text, /EqualToPageThree/);
});
