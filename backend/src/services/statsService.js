// Real learning analytics derived from question-level attempt results.
// Topic/concept performance is computed from the concept column on questions,
// cross-referenced with per-question attempt results — never from quiz metadata.

import { getDatabase } from './database.js';

export class StatsService {
  async getStats(userId) {
    const db = getDatabase();

    const qCount = await db.get('SELECT COUNT(*) AS c FROM quizzes WHERE user_id = ?', [userId]);
    const aCount = await db.get('SELECT COUNT(*) AS c FROM attempts WHERE user_id = ?', [userId]);
    const avg = await db.get('SELECT AVG(score) AS a FROM attempts WHERE user_id = ?', [userId]);
    const best = await db.get('SELECT MAX(score) AS m FROM attempts WHERE user_id = ?', [userId]);
    const docs = await db.get('SELECT COUNT(*) AS c FROM documents WHERE user_id = ?', [userId]);

    // Attempts joined with quiz names.
    const recentAttempts = await db.all(
      `SELECT a.id, a.quiz_id, q.name AS quiz_name, a.score, a.total_questions, a.correct_count, a.finished_at
       FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.user_id = ?
       ORDER BY a.finished_at DESC LIMIT 10`,
      [userId]
    );

    // Concept / topic performance from question-level results.
    const concept = await this.computeConceptPerformance(userId);

    // Difficulty performance.
    const difficulty = await this.computeDifficultyPerformance(userId);

    const history = await db.all(
      `SELECT DATE(finished_at) AS date, AVG(score) AS avg_score, COUNT(*) AS attempts
       FROM attempts WHERE user_id = ? AND finished_at >= datetime('now','-30 days')
       GROUP BY DATE(finished_at) ORDER BY date`,
      [userId]
    );

    // Study streak (consecutive days with at least one completed attempt, capped at 14 lookback).
    let streak = 0;
    const daySet = new Set(
      (await db.all(
        "SELECT DISTINCT DATE(finished_at) AS d FROM attempts WHERE user_id = ? AND finished_at >= date('now','-30 days')",
        [userId]
      )).map((r) => r.d)
    );
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i += 1) {
      const key = cursor.toISOString().slice(0, 10);
      if (daySet.has(key)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else if (i === 0) {
        // today has no attempt; allow streak to count from yesterday
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      quizzesTaken: qCount.c,
      totalAttempts: aCount.c,
      documentsCount: docs.c,
      avgScore: Math.round(avg.a || 0),
      bestScore: best.m || 0,
      studyStreak: streak,
      recentAttempts,
      conceptPerformance: concept,
      difficultyPerformance: difficulty,
      progressHistory: history.map((p) => ({ date: p.date, avgScore: Math.round(p.avg_score || 0), attempts: p.attempts })),
    };
  }

  // Per-concept: questions attempted, correct rate. Sources from question rows that
  // appear in attempts.results (question-level), so it reflects real performance.
  async computeConceptPerformance(userId) {
    const db = getDatabase();
    const rows = await db.all(
      `SELECT a.results, a.user_id
       FROM attempts a WHERE a.user_id = ?`,
      [userId]
    );
    const map = new Map();
    for (const row of rows) {
      let results = null;
      try { results = JSON.parse(row.results); } catch { results = null; }
      if (!results) continue;
      for (const r of results) {
        const key = r.concept || 'General';
        if (!map.has(key)) map.set(key, { topic: key, correct: 0, total: 0 });
        const e = map.get(key);
        e.total += 1;
        if (r.isCorrect) e.correct += 1;
      }
    }
    const arr = [...map.values()].map((e) => ({
      topic: e.topic,
      accuracy: e.total ? Math.round((e.correct / e.total) * 100) : 0,
      attempts: e.total,
    }));
    arr.sort((a, b) => b.attempts - a.attempts);
    const strengths = arr.filter((c) => c.accuracy >= 70 && c.attempts > 0).slice(0, 6);
    const weaknesses = arr.filter((c) => c.accuracy < 60).slice(0, 6);
    return { byTopic: arr.slice(0, 20), strengths, weaknesses };
  }

  async computeDifficultyPerformance(userId) {
    const db = getDatabase();
    const rows = await db.all('SELECT results FROM attempts WHERE user_id = ?', [userId]);
    const tally = { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } };
    for (const row of rows) {
      let results = null;
      try { results = JSON.parse(row.results); } catch { results = null; }
      if (!results) continue;
      for (const r of results) {
        const d = (r.difficulty || 'medium').toLowerCase();
        if (!tally[d]) tally[d] = { correct: 0, total: 0 };
        tally[d].total += 1;
        if (r.isCorrect) tally[d].correct += 1;
      }
    }
    return Object.entries(tally).map(([difficulty, v]) => ({
      difficulty,
      accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
      attempts: v.total,
    }));
  }
}

export default StatsService;
