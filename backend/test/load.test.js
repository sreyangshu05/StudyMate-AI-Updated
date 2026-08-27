// Load test: drives the REAL HTTP server with concurrent request bursts to
// verify (a) the app stays responsive and error-free under load, (b) the
// rate limiter enforces its threshold under concurrent contention (no
// over-admission race), and (c) throughput/latency are sane.
//
// Run: node scripts/run-tests.mjs   (isolated per-file; this file is included)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestApp } from './helpers.js';
import { rateLimit } from '../src/middleware/rateLimit.js';
import { RateLimitError } from '../src/errors.js';
import express from 'express';

// Helper: fire N concurrent fetches to a URL, return array of {status, ms}.
async function burst(url, n) {
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: n }, async () => {
      const s = Date.now();
      const r = await fetch(url);
      await r.text();
      return { status: r.status, ms: Date.now() - s };
    })
  );
  return { results, wall: Date.now() - t0 };
}

test('load: health endpoint handles 200 concurrent requests with zero 5xx', async () => {
  const ctx = await setupTestApp();
  const { results, wall } = await burst(`${ctx.base}/api/health`, 200);
  ctx.cleanup();

  const ok = results.filter((r) => r.status === 200).length;
  const serverErrors = results.filter((r) => r.status >= 500).length;
  const avgMs = Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length);
  const rps = Math.round((200 / wall) * 1000);

  assert.equal(serverErrors, 0, 'no 5xx under load');
  assert.ok(ok >= 190, `most requests succeeded (got ${ok}/200)`);
  assert.ok(avgMs < 500, `avg latency sane (got ${avgMs}ms)`);
  // eslint-disable-next-line no-console
  console.log(`  [load] health: 200 reqs in ${wall}ms, avg ${avgMs}ms, ~${rps} rps, 5xx=${serverErrors}`);
});

test('load: rate limiter enforces threshold under concurrent contention', async () => {
  const ctx = await setupTestApp();
  ctx.cleanup(); // we use a scratch app with a tiny limit

  // Scratch app with max=5 over a 5s window, exercised concurrently.
  const app = express();
  app.get('/r', rateLimit({ windowMs: 5000, max: 5, keyPrefix: 'lt' }), (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => {
    if (err instanceof RateLimitError) {
      return res.status(429).json({ success: false, error: { code: 'RATE_LIMITED' } });
    }
    res.status(500).json({ success: false, error: { code: 'UNKNOWN' } });
  });

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  // Fire 50 concurrent requests against a max=5 window. Exactly 5 should be
  // admitted (200) and the rest rejected (429) — no over-admission under race.
  const { results } = await burst(`${base}/r`, 50);
  server.close();

  const admitted = results.filter((r) => r.status === 200).length;
  const rejected = results.filter((r) => r.status === 429).length;

  assert.equal(admitted, 5, `exactly max admitted under concurrency (got ${admitted})`);
  assert.equal(rejected, 45, `remainder rejected (got ${rejected})`);
});
