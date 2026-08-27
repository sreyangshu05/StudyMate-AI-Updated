// Lightweight health + readiness endpoints.

import express from 'express';
import { getDatabase, initDatabase } from '../services/database.js';

const router = express.Router();

// Liveness: process is up. Never touches the DB.
router.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Readiness: verifies required dependencies (database reachable).
// Ensures the DB is initialized even if server warm-up hasn't finished, so /ready
// reflects real DB health.
router.get('/ready', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await initDatabase();
    const db = getDatabase();
    await db.get('SELECT COUNT(*) AS c FROM users');
    return res.status(200).json({ success: true, status: 'ready', database: 'ok' });
  } catch (err) {
    return res.status(503).json({ success: false, status: 'not_ready', database: 'error' });
  }
});

export default router;
