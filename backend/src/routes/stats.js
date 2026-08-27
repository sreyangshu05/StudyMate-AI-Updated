// Analytics routes backed by real, question-level statistics.

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { StatsService } from '../services/statsService.js';
import { ok } from '../errors.js';

const router = express.Router();
const statsService = new StatsService();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const data = await statsService.getStats(req.user.userId);
    return ok(res, data);
  } catch (err) { return next(err); }
});

router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const data = await statsService.getStats(req.user.userId);
    return ok(res, {
      recentActivity: data.recentAttempts.map((a) => ({ type: 'attempt', title: a.quiz_name, date: a.finished_at, score: a.score })),
      performance: {
        totalQuizzes: data.quizzesTaken,
        totalAttempts: data.totalAttempts,
        avgScore: data.avgScore,
        bestScore: data.bestScore,
      },
      progressHistory: data.progressHistory,
      conceptPerformance: data.conceptPerformance,
      difficultyPerformance: data.difficultyPerformance,
    });
  } catch (err) { return next(err); }
});

export default router;
