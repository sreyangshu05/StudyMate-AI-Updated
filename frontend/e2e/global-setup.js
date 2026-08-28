// Boot the full studymate stack for end-to-end browser tests.
//
//   1. REAL backend (createApp + real HTTP server) with a deterministic stub
//      AI provider, on an ephemeral port, with a throwaway DB + uploads dir.
//   2. A same-origin static server serving the PRODUCTION frontend build
//      (../dist-e2e, VITE_API_BASE_URL=/api) with /api proxied to the backend —
//      the nginx deployment topology.
//
// The teardown helper (closeStack) is returned so the Playwright reporter can
// shut it all down after the run.
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist-e2e');

// --- deterministic stub AI provider (mirrors backend/test/helpers.js) ------
function fakeEmbedding(text) {
  const D = 256;
  const vec = new Array(D).fill(0);
  const tokens = String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const seen = new Set();
  for (const t of tokens) { if (seen.has(t)) continue; seen.add(t); vec[hash(t) % D] += 1; }
  const mag = Math.sqrt(vec.reduce((a, v) => a + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

function startAIStub() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      let parsed = {}; try { parsed = JSON.parse(body || '{}'); } catch {}
      if (req.url.includes('/embeddings')) {
        const input = parsed.input || '';
        const text = Array.isArray(input) ? input.join(' ') : String(input);
        const emb = fakeEmbedding(text);
        const buf = Buffer.alloc(emb.length * 4);
        emb.forEach((v, i) => buf.writeFloatLE(v, i * 4));
        res.end(JSON.stringify({ data: [{ embedding: buf.toString('base64') }] }));
        return;
      }
      if (req.url.includes('/chat/completions')) {
        res.end(JSON.stringify({ choices: [{ message: { content: 'A grounded stub answer. [Document, p. 1]' } }] }));
        return;
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, baseURL: `http://127.0.0.1:${server.address().port}` })));
}

// --- static frontend server + /api proxy -----------------------------------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
};
function startFrontendServer(frontendPort, backendPort) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api')) {
      const proxyReq = http.request({
        host: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: req.headers,
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{}'); });
      req.pipe(proxyReq);
      return;
    }
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    let file = path.join(DIST_DIR, p);
    if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', req.url.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(frontendPort, '127.0.0.1', () => resolve(server)));
}

// --- boot everything --------------------------------------------------------
export default async function globalSetup() {
  if (!existsSync(DIST_DIR)) {
    throw new Error('frontend/dist-e2e missing. Run `bun run build:e2e` before e2e tests.');
  }

  const root = mkdtempSync(path.join(tmpdir(), 'studymate-e2e-'));
  const uploadsDir = path.join(root, 'uploads');
  mkdirSync(uploadsDir, { recursive: true });

  // Point the (cached) backend config at isolated runtime data before app init.
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-only-secret';
  process.env.DATABASE_PATH = path.join(root, 'e2e.db');
  process.env.STORAGE_PATH = uploadsDir;
  process.env.TEST_ROOT = root;
  // The browser hits the frontend origin (127.0.0.1:<FRONTEND_PORT>) and the
  // static server forwards the Origin header through the /api proxy. The
  // backend's CORS allow-list must include exactly this origin — same as
  // production, where CORS_ORIGINS is set to the public frontend host.
  process.env.CORS_ORIGINS = `http://127.0.0.1:${process.env.E2E_FRONTEND_PORT || 4173}`;

  const stub = await startAIStub();
  process.env.AI_BASE_URL = `${stub.baseURL}/v1`;
  process.env.OPENROUTER_API_KEY = 'sk-e2e-stub';

  // Import the backend from its real source (../backend/src) and boot it.
  const { initDatabase } = await import('../../backend/src/services/database.js');
  const { createApp } = await import('../../backend/src/app.js');
  // Point the real OpenAI-compatible client at the stub provider.
  const { resetAIClientForTests } = await import('../../backend/src/ai/client.js');
  resetAIClientForTests();

  await initDatabase();
  const backend = await (new Promise((resolve) => {
    const srv = createApp().listen(0, '127.0.0.1', () => resolve(srv));
  }));
  const backendPort = backend.address().port;

  const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 4173);
  const frontend = await startFrontendServer(FRONTEND_PORT, backendPort);

  const teardown = () => {
    try { frontend.close(); } catch {}
    try { backend.close(); } catch {}
    try { stub.server.close(); } catch {}
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  };

  return { teardown, frontendUrl: `http://127.0.0.1:${FRONTEND_PORT}` };
}
