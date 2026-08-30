// Centralized, validated environment configuration.
// All secrets must come from the environment (or a gitignored .env file).
// Never hard-code defaults for secrets.

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from repo root (cwd-independent) first, then server-local, then process env.
// dotenv does not override already-set variables, so process.env wins.
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

function parseIntEnv(name, fallback, { min = 0, max = Infinity } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid ${name}: expected an integer, got "${raw}"`);
  }
  return Math.min(Math.max(n, min), max);
}

function parseCsv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function resolveAdminEmails() {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const port = parseIntEnv('PORT', 5000, { min: 1, max: 65535 });

// JWT secret must be provided. A missing secret is a hard startup error.
// In tests a fixed, clearly test-only secret is used (never for production).
const isTest = (process.env.NODE_ENV || 'development') === 'test';
const jwtSecret = process.env.JWT_SECRET || (isTest ? 'test-only-secret-not-for-production' : '');
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required. Set it in your environment or .env file.');
}
if (isTest && jwtSecret === 'test-only-secret-not-for-production') {
  console.warn('[config] using test-only JWT secret (do NOT use in production)');
}

// Tests use an isolated temporary database so they never touch real data.
const testDbPath = isTest && !process.env.DATABASE_PATH
  ? path.join(process.env.TEST_ROOT || '/tmp', `studymate-test-${process.pid}.db`)
  : (process.env.DATABASE_PATH || path.join(__dirname, '../data', 'studymate.db'));
const testUploads = isTest && !process.env.STORAGE_PATH
  ? path.join(process.env.TEST_ROOT || '/tmp', `studymate-test-uploads-${process.pid}`)
  : (process.env.STORAGE_PATH || path.join(__dirname, '../uploads'));

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  isTest: (process.env.NODE_ENV || 'development') === 'test',

  port,
  host: process.env.HOST || '0.0.0.0',

  dataDir: isTest ? path.dirname(testDbPath) : path.join(__dirname, '../data'),
  dbPath: testDbPath,
  uploadsDir: testUploads,

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // CORS: explicit allow-list. Unrestricted CORS is forbidden in production.
  corsOrigins: process.env.NODE_ENV === 'production'
    ? parseCsv('CORS_ORIGINS', [])
    : parseCsv('CORS_ORIGINS', ['http://localhost:3000', 'http://127.0.0.1:3000']),

  // AI providers (OpenRouter-compatible / OpenAI-compatible)
  openRouterApiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'openai/gpt-4o-mini',
  embeddingModel: process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small',
  aiBaseUrl: process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
  aiTimeoutMs: parseIntEnv('AI_TIMEOUT_MS', 30000, { min: 1000, max: 120000 }),
  aiMaxRetries: parseIntEnv('AI_MAX_RETRIES', 2, { min: 0, max: 5 }),

  // Upload constraints
  maxUploadSizeBytes: parseIntEnv('MAX_UPLOAD_SIZE_MB', 20, { min: 1, max: 100 }) * 1024 * 1024,

  // Retrieval constraints
  defaultTopK: parseIntEnv('RAG_TOP_K', 4, { min: 1, max: 20 }),
  maxTopK: parseIntEnv('RAG_MAX_TOP_K', 12, { min: 1, max: 50 }),
  maxSelectedDocs: parseIntEnv('MAX_SELECTED_DOCS', 10, { min: 1, max: 50 }),

  // Quiz constraints
  maxQuizQuestions: parseIntEnv('MAX_QUIZ_QUESTIONS', 50, { min: 5, max: 100 }),
  maxChatContextDocs: parseIntEnv('MAX_CHAT_CONTEXT_DOCS', 5, { min: 1, max: 20 }),

  // Rate limits
  rateLimit: {
    // In tests, effectively disable limits so suites don't trip them; a
    // dedicated rate-limit test overrides these to assert the 429 path.
    login: isTest ? 100000 : parseIntEnv('RATE_LIMIT_LOGIN', 10, { min: 1 }),
    register: isTest ? 100000 : parseIntEnv('RATE_LIMIT_REGISTER', 5, { min: 1 }),
    authWindowMs: isTest ? 3600 * 1000 : parseIntEnv('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000, { min: 1000 }),
    ai: isTest ? 100000 : parseIntEnv('RATE_LIMIT_AI', 30, { min: 1 }),
    aiWindowMs: isTest ? 3600 * 1000 : parseIntEnv('RATE_LIMIT_AI_WINDOW_MS', 60 * 1000, { min: 1000 }),
    general: isTest ? 100000 : parseIntEnv('RATE_LIMIT_GENERAL', 300, { min: 10 }),
    generalWindowMs: isTest ? 3600 * 1000 : parseIntEnv('RATE_LIMIT_GENERAL_WINDOW_MS', 60 * 1000, { min: 1000 }),
  },

  // Request body limits
  bodyLimitMb: parseIntEnv('BODY_LIMIT_MB', 1, { min: 1 }),
  chatBodyLimitMb: parseIntEnv('CHAT_BODY_LIMIT_MB', 1, { min: 1 }),

  // Logging
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  // YouTube integration
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  youtubeEnabled: (process.env.YOUTUBE_ENABLED || 'false') === 'true',

  adminEmails: resolveAdminEmails(),
};

// Re-read AI provider env vars into the existing config object. Needed by tests
// that point the real client at a stub provider AFTER config was first loaded
// (config is a module singleton). Safe to call at any time; recomputes from env.
export function reloadAIEnv() {
  config.openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
  config.llmModel = process.env.LLM_MODEL || 'openai/gpt-4o-mini';
  config.embeddingModel = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small';
  config.aiBaseUrl = process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1';
  return config;
}

export default config;
