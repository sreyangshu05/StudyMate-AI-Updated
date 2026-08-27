// Test harness: builds an isolated backend instance per test against a
// throwaway SQLite DB, with a deterministic in-process stub AI provider so the
// real OpenAI-compatible client code path (retry, JSON parse) is exercised.
//
// Each test file must set env BEFORE importing this (or rely on the module's
// setup): NODE_ENV=test, JWT_SECRET=<secret>. Database/storage paths default to
// fresh temp dirs created by setupTestApp().

import { mkdtempSync, existsSync, mkdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

// ---------------------------------------------------------------------------
// Deterministic fake embedding: text -> stable 8-dim vector so cosine is
// Deterministic fake embedding: bag-of-words over alphanumeric tokens into a
// sparse unit vector. Cosine therefore reflects shared-vocabulary overlap, so
// related queries/passages score well above the retrieval cutoff. This makes
// retrieval scoring deterministic and meaningful in tests.
function strHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function fakeEmbedding(text) {
  const D = 256;
  const vec = new Array(D).fill(0);
  const tokens = String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const seen = new Set();
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    vec[strHash(t) % D] += 1;
  }
  const mag = Math.sqrt(vec.reduce((a, v) => a + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}

// ---------------------------------------------------------------------------
// Stub AI provider server for POST /embeddings and /chat/completions. Returns
// deterministic embeddings and valid quiz JSON / grounded answers.
// ---------------------------------------------------------------------------
export function startStubAIProvider() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch { /* ignore */ }

      if (req.url.includes('/embeddings')) {
        const input = parsed.input || '';
        const text = Array.isArray(input) ? input.join(' ') : String(input);
        const emb = fakeEmbedding(text);
        // The openai SDK (v4.104+) defaults to encoding_format="base64" and
        // decodes the embedding with toFloat32Array. Honor that so the decoded
        // vector matches. When a caller explicitly passes encoding_format
        // (e.g. "float"), return the plain array instead.
        const fmt = parsed.encoding_format || 'base64';
        let embedding = emb;
        if (fmt === 'base64') {
          const buf = Buffer.alloc(emb.length * 4);
          emb.forEach((v, i) => buf.writeFloatLE(v, i * 4));
          embedding = buf.toString('base64');
        }
        res.end(JSON.stringify({ data: [{ embedding }] }));
        return;
      }

      if (req.url.includes('/chat/completions')) {
        const messages = parsed.messages || [];
        const userMsg = messages.map((m) => String(m.content || '')).join('\n');

        if (/exactly (\d+) exam-style/.test(userMsg)) {
          const count = Math.min(Number(userMsg.match(/exactly (\d+) exam-style/)[1]) || 2, 4);
          const stems = [
            'Which law states that force equals mass times acceleration?',
            'What is kinetic energy best described as?',
            'Which topic is the study of heat and temperature?',
            'Which law describes action and reaction?',
          ];
          const arr = [];
          for (let i = 0; i < count; i += 1) {
            arr.push({
              type: 'MCQ',
              stem: stems[i % stems.length],
              choices: ['momentum', 'acceleration', 'force', 'energy'],
              correct_index: i % 4,
              explanation: 'Stub explanation.',
              difficulty: 'easy',
              page_no: (i % 3) + 1,
              source_doc_title: 'Stub Doc',
              concept: 'mechanics',
            });
          }
          res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(arr) } }] }));
          return;
        }

        res.end(JSON.stringify({ choices: [{ message: { content: 'Grounded stub answer. [Stub Doc, p. 1]' } }] }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseURL: `http://127.0.0.1:${server.address().port}/v1` });
    });
  });
}

// ---------------------------------------------------------------------------
// Point config + AI client at the stub provider.
// ---------------------------------------------------------------------------
export async function useStubAI(baseURL) {
  process.env.AI_BASE_URL = baseURL;
  process.env.OPENROUTER_API_KEY = 'sk-test-stub';
  const { resetAIClientForTests } = await import('../src/ai/client.js');
  resetAIClientForTests();
}

// ---------------------------------------------------------------------------
// Isolated test backend instance against a fresh temp DB/storage.
// Returns an already-listening server plus the DB/root for cleanup.
// ---------------------------------------------------------------------------
let currentModuleEnv = null;

export async function setupTestApp() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'studymate-test-'));
  const dataDir = path.join(root, 'data');
  const uploadsDir = path.join(root, 'uploads');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(path.join(root, 'media'), { recursive: true });

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  process.env.DATABASE_PATH = path.join(dataDir, 'test.db');
  process.env.STORAGE_PATH = uploadsDir;
  process.env.TEST_ROOT = root;

  const { initDatabase } = await import('../src/services/database.js');
  const { createApp } = await import('../src/app.js');
  await initDatabase();
  const app = createApp();

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const cleanup = () => {
    try { server.close(); } catch { /* best effort */ }
    try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  };

  return { app, server, base, root, uploadsDir, dataDir, cleanup };
}

// JSON helpers ---------------------------------------------------------------
export function api(base) {
  return {
    async req(method, p, { token, body } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(base + p, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }
      return { status: res.status, json, ok: res.ok };
    },
    async register(name, email, password = 'StrongPass123') {
      const r = await this.req('POST', '/api/auth/register', { body: { name, email, password } });
      return { ...r, token: r.json?.data?.token, user: r.json?.data?.user };
    },
    async login(email, password) {
      const r = await this.req('POST', '/api/auth/login', { body: { email, password } });
      return { ...r, token: r.json?.data?.token, user: r.json?.data?.user };
    },
  };
}

export function mkdirp(p) {
  mkdirSync(p, { recursive: true });
}

export { existsSync, mkdirSync };
