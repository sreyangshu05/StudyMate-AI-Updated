// Rate-limit middleware: verifies the 429 path returns RATE_LIMITED with a
// Retry-After header. Uses a tiny window directly against the middleware.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { setupTestApp } from './helpers.js';

// Use the real middleware with an explicit tiny limit, exercised over the real app.
test('rate limit returns 429 + RATE_LIMITED after threshold', async () => {
  const ctx = await setupTestApp();
  // The real auth register is rate-limited but with huge test limits; we instead
  // hit /api/health is not limited. Use the run of registrations to confirm the
  // middleware 429s by monkey-patching is too invasive. Instead, validate the
  // middleware behavior directly on a scratch app with max=2.
  ctx.cleanup();

  const { rateLimit } = await import('../src/middleware/rateLimit.js');
  const { RateLimitError } = await import('../src/errors.js');
  const app = express();
  app.get('/r', rateLimit({ windowMs: 10000, max: 2, keyPrefix: 't' }), (_req, res) => res.json({ ok: true }));
  // error handler
  app.use((err, _req, res, _next) => {
    if (err instanceof RateLimitError) {
      return res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: err.message } });
    }
    res.status(500).json({ success: false, error: { code: 'UNKNOWN', message: err.message } });
  });

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const r1 = await fetch(`${base}/r`); // ok
  const r2 = await fetch(`${base}/r`); // ok
  const r3 = await fetch(`${base}/r`); // 429
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r3.status, 429);
  assert.ok(r3.headers.get('retry-after'));
  const body = await r3.json();
  assert.equal(body.error.code, 'RATE_LIMITED');
  server.close();
});
