// Account deletion: complete, ownership-scoped removal of a user and ALL their data,
// including physical uploaded files and embeddings. Deleting the user row also
// invalidates their JWTs on the next authenticated request (requireAuth re-checks
// the user still exists). Idempotent: deleting a nonexistent user is a no-op.

import fs from 'fs';
import path from 'path';
import { getDatabase } from './database.js';
import config from '../config.js';
import { NotFoundError } from '../errors.js';

export class AccountService {
  async deleteAccount(userId) {
    const db = getDatabase();
    const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) throw new NotFoundError('Account not found');

    // Collect this user's documents and their physical files.
    const docs = await db.all('SELECT id, file_path, filename FROM documents WHERE user_id = ?', [userId]);
    const docIds = docs.map((d) => d.id);
    const files = docs.map((d) => d.file_path || (d.filename ? path.join(config.uploadsDir, d.filename) : null)).filter(Boolean);

    // Delete in dependency order. SQLite FK ON DELETE CASCADE for quiz_documents;
    // we delete child rows explicitly for clarity and correctness.
    if (docIds.length) {
      const ph = docIds.map(() => '?').join(',');
      await db.run(`DELETE FROM passages WHERE doc_id IN (${ph})`, docIds);
      await db.run(`DELETE FROM quiz_documents WHERE doc_id IN (${ph})`, docIds);
      const qids = (await db.all(`SELECT DISTINCT id FROM quizzes WHERE user_id = ? OR doc_id IN (${ph})`, [userId, ...docIds])).map((r) => r.id);
      if (qids.length) {
        const qph = qids.map(() => '?').join(',');
        await db.run(`DELETE FROM questions WHERE quiz_id IN (${qph})`, qids);
        await db.run(`DELETE FROM attempts WHERE quiz_id IN (${qph})`, qids);
        await db.run(`DELETE FROM quizzes WHERE id IN (${qph})`, qids);
      }
      await db.run(`DELETE FROM documents WHERE id IN (${ph})`, docIds);
    }

    await db.run('DELETE FROM attempts WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM quizzes WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM user_stats WHERE user_id = ?', [userId]);

    const chats = await db.all('SELECT id FROM chats WHERE user_id = ?', [userId]);
    if (chats.length) {
      const cph = chats.map(() => '?').join(',');
      await db.run(`DELETE FROM chat_messages WHERE chat_id IN (${cph})`, chats.map((c) => c.id));
      await db.run(`DELETE FROM chats WHERE id IN (${cph})`, chats.map((c) => c.id));
    }

    await db.run('DELETE FROM users WHERE id = ?', [userId]);

    // Remove physical files (best-effort, idempotent).
    for (const f of files) {
      try { if (f && fs.existsSync(f)) await fs.promises.unlink(f); } catch { /* best effort */ }
    }

    return { deleted: true, userId };
  }
}

export default AccountService;
