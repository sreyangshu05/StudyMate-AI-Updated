// Express application factory. Exported separately from index.js so tests can
// build an app without listening.

import express from 'express';
import cors from 'cors';
import { requestLogger } from './middleware/logger.js';
import { rateLimit } from './middleware/rateLimit.js';
import config from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';

import systemRoutes from './routes/system.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import qaRoutes from './routes/qa.js';
import quizRoutes from './routes/quiz.js';
import statsRoutes from './routes/stats.js';
import chatRoutes from './routes/chat.js';
import exportRoutes from './routes/export.js';
import accountRoutes from './routes/account.js';
import youtubeRoutes from './routes/youtube.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // Request logging + request IDs. High level, before routes.
  app.use(requestLogger);

  // Restricted CORS (allow-list from config). No unrestricted origin.
  app.use(cors({
    origin(origin, cb) {
      // Same-origin requests (no Origin header) or allowed origins are fine.
      if (!origin || config.corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Access-Token'],
  }));

  // Security headers (minimal, tested set).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Parsed body limits: JSON kept small; multipart handles uploads separately.
  app.use(express.json({ limit: `${config.bodyLimitMb}mb` }));
  app.use(express.urlencoded({ extended: true, limit: `${config.bodyLimitMb}mb` }));

  // Top-level API health.
  app.get('/api', (_req, res) => res.json({
    success: true,
    message: 'StudyMate API',
    version: '2.0.0',
    docs: '/docs',
  }));

  // Rate-limit general API access (authenticated by ip/user mix).
  app.use('/api', rateLimit({ windowMs: config.rateLimit.generalWindowMs, max: config.rateLimit.general, keyPrefix: 'gen' }));

  app.use('/api', systemRoutes); // /api/health, /api/ready
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/qa', qaRoutes);
  app.use('/api/quiz', quizRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/youtube', youtubeRoutes);

  // 404 for unknown routes.
  app.use(notFoundHandler);

  // Centralized error handling (last).
  app.use(errorHandler);

  return app;
}

export default createApp;
