// Quiz routes: generate, list, get (no answers exposed pre-submission), submit
// (server-authoritative grading), attempts (ownership-scoped).

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { QuizService } from '../services/quizService.js';
import { getDatabase } from '../services/database.js';
import { rateLimit } from '../middleware/rateLimit.js';
import config from '../config.js';
import { ok, NotFoundError } from '../errors.js';

const router = express.Router();
const quizService = new QuizService();

// Generate a quiz (expensive AI op — rate-limited).
router.post('/generate',
  authenticate,
  rateLimit({ windowMs: config.rateLimit.aiWindowMs, max: config.rateLimit.ai, keyPrefix: 'quizgen' }),
  async (req, res, next) => {
    try {
      const { docIds, numQuestions, distribution } = req.body;
      const quiz = await quizService.generate({ userId: req.user.userId, docIds, numQuestions, distribution });
      return ok(res, { quizId: quiz.id, quiz }, 201);
    } catch (err) { return next(err); }
  }
);

// List the user's quizzes.
router.get('/', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const quizzes = await db.all('SELECT id, name, doc_id, created_at, metadata FROM quizzes WHERE user_id = ? ORDER BY created_at DESC', [req.user.userId]);
    return ok(res, { quizzes: quizzes.map((q) => ({ ...q, metadata: safeJSON(q.metadata) })) });
  } catch (err) { return next(err); }
});

// Get a quiz WITHOUT correct answers (a client must not read answers pre-submission).
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const quiz = await quizService.buildQuiz(Number(req.params.id), req.user.userId, false);
    return ok(res, { quiz });
  } catch (err) { return next(err); }
});

// Submit an attempt. Server-authoritative grading.
router.post('/:id/attempt', authenticate, async (req, res, next) => {
  try {
    const result = await quizService.submitAttempt({
      quizId: Number(req.params.id),
      userId: req.user.userId,
      answers: req.body.answers,
    });
    return ok(res, result, 201);
  } catch (err) { return next(err); }
});

// Get attempts for a quiz (ownership-scoped) including full review data.
router.get('/:id/attempts', authenticate, async (req, res, next) => {
  try {
    const attempts = await quizService.getAttemptsForQuiz(Number(req.params.id), req.user.userId);
    return ok(res, { attempts });
  } catch (err) { return next(err); }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const db = getDatabase();
    const quiz = await db.get('SELECT id FROM quizzes WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.userId]);
    if (!quiz) throw new NotFoundError('Quiz not found');
    await db.run('DELETE FROM questions WHERE quiz_id = ?', [quiz.id]);
    await db.run('DELETE FROM attempts WHERE quiz_id = ?', [quiz.id]);
    await db.run('DELETE FROM quiz_documents WHERE quiz_id = ?', [quiz.id]);
    await db.run('DELETE FROM quizzes WHERE id = ?', [quiz.id]);
    return ok(res, { message: 'Quiz deleted' });
  } catch (err) { return next(err); }
});

function safeJSON(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

export default router;
