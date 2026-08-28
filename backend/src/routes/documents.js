// Document routes: upload (with lifecycle status), process, list, get, delete,
// and authenticated file streaming (ownership-checked).

import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { DocumentService } from '../services/documentService.js';
import { ingestQueue } from '../services/ingestQueue.js';
import { getDatabase } from '../services/database.js';
import config from '../config.js';
import { ok, NotFoundError, ValidationError } from '../errors.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadSizeBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((file.mimetype || '').toLowerCase() === 'application/pdf') {
      return cb(null, true);
    }
    return cb(new Error('Only PDF files are allowed'));
  },
});

const documentService = new DocumentService({ uploadsDir: config.uploadsDir });

// Upload: validate + persist file, create row in UPLOADING state.
router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }
    const title = req.body.title && typeof req.body.title === 'string'
      ? req.body.title.trim().slice(0, 255)
      : '';
    const doc = await documentService.beginUpload({
      userId: req.user.userId,
      title: title || req.file.originalname,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
    });
    return ok(res, {
      docId: doc.id,
      title: doc.title,
      status: doc.status,
      filename: doc.filename,
    }, 201);
  } catch (err) { return next(err); }
});

// Ingest/process: enqueue the document for async extraction + embeddings.
// Returns immediately with PROCESSING; the background worker transitions the
// document to READY or FAILED (poll GET /api/documents/:id for the terminal
// state). This stops large PDFs from holding the HTTP request open.
router.post('/ingest', authenticate, async (req, res, next) => {
  try {
    const { docId } = req.body;
    if (!docId) throw new ValidationError('Document ID is required');

    // Verify ownership before enqueueing so a foreign/cross-user enqueue is
    // rejected (the worker also re-checks ownership inside processDocument).
    const db = getDatabase();
    const doc = await db.get(
      'SELECT id FROM documents WHERE id = ? AND user_id = ?',
      [Number(docId), req.user.userId]
    );
    if (!doc) throw new NotFoundError('Document not found');

    // Mark PROCESSING up-front so a poll immediately after this 202 sees a
    // non-stale state, even before the worker ticks.
    await db.run("UPDATE documents SET status = 'PROCESSING', error = NULL WHERE id = ?", [Number(docId)]);

    const result = ingestQueue.enqueue(docId, req.user.userId);
    return ok(res, { status: 'PROCESSING', enqueued: result.enqueued, docId: Number(docId) }, 202);
  } catch (err) { return next(err); }
});

// Retry processing a FAILED document (re-enqueue).
router.post('/:id/retry', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const doc = await db.get(
      'SELECT id, status FROM documents WHERE id = ? AND user_id = ?',
      [Number(req.params.id), req.user.userId]
    );
    if (!doc) throw new NotFoundError('Document not found');

    await db.run("UPDATE documents SET status = 'PROCESSING', error = NULL WHERE id = ?", [Number(req.params.id)]);

    const result = ingestQueue.enqueue(req.params.id, req.user.userId);
    return ok(res, { status: 'PROCESSING', enqueued: result.enqueued, docId: Number(req.params.id) }, 202);
  } catch (err) { return next(err); }
});

// List the user's documents.
router.get('/', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const documents = await db.all(
      `SELECT id, title, filename, pages, status, chunk_count, uploaded_at, processed_at
       FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC`,
      [req.user.userId]
    );
    return ok(res, { documents });
  } catch (err) { return next(err); }
});

// Get one document (ownership-scoped).
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const document = await db.get(
      'SELECT id, title, filename, pages, status, chunk_count, error, uploaded_at, processed_at FROM documents WHERE id = ? AND user_id = ?',
      [Number(req.params.id), req.user.userId]
    );
    if (!document) throw new NotFoundError('Document not found');
    return ok(res, { document });
  } catch (err) { return next(err); }
});

// Stream the physical PDF — authenticated, ownership-checked. This is the ONLY way
// to fetch a stored file (unrestricted express.static is removed).
router.get('/:id/file', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const document = await db.get(
      'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      [Number(req.params.id), req.user.userId]
    );
    if (!document) throw new NotFoundError('File not found');

    const fs = await import('fs');
    const path = await import('path');
    const filePath = document.file_path || path.join(config.uploadsDir, document.filename);
    if (!fs.existsSync(filePath)) throw new NotFoundError('File not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="studymate-${document.id}.pdf"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) { return next(err); }
});

// Delete document (complete: passages, embeddings, related quizzes, physical file).
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await documentService.deleteDocument(Number(req.params.id), req.user.userId);
    return ok(res, { message: 'Document deleted', data: result });
  } catch (err) { return next(err); }
});

export default router;
