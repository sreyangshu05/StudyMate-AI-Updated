// Chat routes. Ownership-checked at every message read/write. When document
// context is requested, retrieval is ownership-scoped (inside EmbeddingService).

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDatabase } from '../services/database.js';
import { LLMService } from '../services/llmService.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { validateText, validateDocIds } from '../validation.js';
import config from '../config.js';
import { ok, NotFoundError } from '../errors.js';

const router = express.Router();
const llm = new LLMService();
const embeddings = new EmbeddingService();

async function getChat(db, chatId, userId) {
  const chat = await db.get('SELECT * FROM chats WHERE id = ? AND user_id = ?', [chatId, userId]);
  return chat;
}

router.post('/', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const title = req.body.title && typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 120) : `Chat ${new Date().toLocaleDateString()}`;
    const result = await db.run('INSERT INTO chats (user_id, title) VALUES (?, ?)', [req.user.userId, title]);
    return ok(res, { chatId: result.lastID, title }, 201);
  } catch (err) { return next(err); }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const chats = await db.all('SELECT id, title, created_at FROM chats WHERE user_id = ? ORDER BY created_at DESC', [req.user.userId]);
    return ok(res, { chats });
  } catch (err) { return next(err); }
});

router.get('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const chat = await getChat(db, Number(req.params.id), req.user.userId);
    if (!chat) return next(new NotFoundError('Chat not found'));
    const messages = await db.all('SELECT id, role, content, created_at FROM chat_messages WHERE chat_id = ? ORDER BY id ASC', [chat.id]);
    return ok(res, { messages });
  } catch (err) { return next(err); }
});

router.post('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const chat = await getChat(db, Number(req.params.id), req.user.userId);
    if (!chat) return next(new NotFoundError('Chat not found'));

    const message = validateText(req.body.message, 'message', { max: 4000 });
    const docIds = validateDocIds(req.body.docIds).slice(0, config.maxChatContextDocs);

    await db.run('INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)', [chat.id, 'user', message]);

    // Ownership-scoped context retrieval.
    let passages = [];
    if (docIds.length > 0) {
      passages = await embeddings.search({ query: message, userId: req.user.userId, docIds, topK: 3 });
    }

    const aiResponse = await llm.generateChatResponse(message, passages);

    await db.run('INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)', [chat.id, 'assistant', aiResponse]);
    const saved = await db.get('SELECT id, role, content, created_at FROM chat_messages WHERE id = last_insert_rowid()');

    return ok(res, { message: aiResponse, messageId: saved.id, usedDocumentContext: passages.length > 0 });
  } catch (err) { return next(err); }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const chat = await getChat(db, Number(req.params.id), req.user.userId);
    if (!chat) return next(new NotFoundError('Chat not found'));
    await db.run('DELETE FROM chat_messages WHERE chat_id = ?', [chat.id]);
    await db.run('DELETE FROM chats WHERE id = ?', [chat.id]);
    return ok(res, { message: 'Chat deleted' });
  } catch (err) { return next(err); }
});

export default router;
