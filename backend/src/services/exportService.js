// Data export: returns the authenticated user's own data as a structured object.
// Never exports another user's data. Includes profile, documents, quiz definitions
// AND their questions (with correct answers, since it is the owner's own data),
// attempts, chat conversations, and stats.

import { getDatabase } from './database.js';
import { StatsService } from './statsService.js';

export class ExportService {
  async exportUserData(userId) {
    const db = getDatabase();

    const user = await db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('User not found');

    const documents = await db.all(
      'SELECT id, title, filename, pages, status, chunk_count, uploaded_at, processed_at FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC',
      [userId]
    );

    const quizzes = await db.all('SELECT * FROM quizzes WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    const quizIds = quizzes.map((q) => q.id);
    const placeholders = quizIds.length ? quizIds.map(() => '?').join(',') : 'NULL';
    const questions = quizIds.length
      ? await db.all(`SELECT * FROM questions WHERE quiz_id IN (${placeholders}) ORDER BY quiz_id, id`, quizIds)
      : [];

    const attempts = await db.all('SELECT * FROM attempts WHERE user_id = ? ORDER BY finished_at DESC', [userId]);
    const chats = await db.all('SELECT * FROM chats WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    const chatIds = chats.map((c) => c.id);
    const cph = chatIds.length ? chatIds.map(() => '?').join(',') : 'NULL';
    const messages = chatIds.length
      ? await db.all(`SELECT * FROM chat_messages WHERE chat_id IN (${cph}) ORDER BY chat_id, created_at, id`, chatIds)
      : [];

    const statsService = new StatsService();
    const stats = await statsService.getStats(userId);

    return {
      exportedAt: new Date().toISOString(),
      profile: { id: user.id, name: user.name, email: user.email, createdAt: user.created_at },
      documents,
      quizzes: quizzes.map((q) => ({
        id: q.id,
        name: q.name,
        docId: q.doc_id,
        createdAt: q.created_at,
        metadata: safeJSON(q.metadata),
      })),
      questions: questions.map((q) => ({
        id: q.id,
        quizId: q.quiz_id,
        type: q.type,
        stem: q.prompt_text,
        choices: safeJSON(q.choices),
        correctAnswer: q.correct_answer,
        correctIndex: q.correct_index,
        explanation: q.explanation,
        difficulty: q.difficulty,
        pageNo: q.page_no,
        concept: q.concept,
        sourceDoc: q.source_doc,
      })),
      attempts: attempts.map((a) => ({
        id: a.id,
        quizId: a.quiz_id,
        score: a.score,
        answers: safeJSON(a.answers),
        results: safeJSON(a.results),
        startedAt: a.started_at,
        finishedAt: a.finished_at,
      })),
      chats: chats.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.created_at,
        messages: messages.filter((m) => m.chat_id === c.id).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
        })),
      })),
      stats,
    };
  }
}

function safeJSON(s) {
  if (s == null) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export default ExportService;
