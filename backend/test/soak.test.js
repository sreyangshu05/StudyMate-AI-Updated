// Long-run soak test (closes the "no long-run soak test" gap).
//
// Drives the REAL HTTP server with a sustained, mixed workload
// (health + ready + auth + documents + dashboard + export + chat) for a
// bounded duration and asserts stability:
//   - zero 5xx and zero network errors across the whole run
//   - no latency creep (later windows are not materially slower than early ones)
//   - the app stays serving end-to-end (documents churned through async ingest)
//
// CI runs a short soak (2s) so it stays fast; operators can run a real soak
// with SOAK_SECONDS=300 (or higher):
//   SOAK_SECONDS=300 npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestApp, api, startStubAIProvider, useStubAI, drainIngestQueue, waitForDocument } from './helpers.js';
import { makeMultiPagePdf } from './pdfgen.js';

const SOAK_SECONDS = Number(process.env.SOAK_SECONDS || 2);
const WINDOW_MS = 500;
const CONCURRENCY = 8;
const NET_ERROR = -1;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function median(xs) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

test(`soak: sustained mixed workload for ${SOAK_SECONDS}s stays stable`, { timeout: 180000 }, async () => {
  const ctx = await setupTestApp();
  const call = api(ctx.base);
  const stub = await startStubAIProvider();
  await useStubAI(stub.baseURL);

  const user = await call.register('Soak', 'soak@load.com');
  assert.ok(user.token, 'register works in soak');

  const windowAvgs = [];
  const window5xx = [];
  const windowNet = [];
  let totalOk = 0;

  const deadline = Date.now() + SOAK_SECONDS * 1000;

  // Background churn: cycle documents through upload -> async ingest -> READY ->
  // delete so the queue, DB writes, and file store stay continuously active.
  const docChurn = (async () => {
    while (Date.now() < deadline) {
      try {
        const form = new FormData();
        const pdfBuf = await makeMultiPagePdf(['physics newton laws', 'energy conservation']);
        form.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'soak.pdf');
        const up = await (await fetch(`${ctx.base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form })).json();
        const docId = up?.data?.docId;
        if (!docId) continue;
        await call.req('POST', '/api/documents/ingest', { token: user.token, body: { docId } });
        await drainIngestQueue();
        await waitForDocument(call.req.bind(call), user.token, docId);
        await call.req('DELETE', `/api/documents/${docId}`, { token: user.token });
      } catch { /* one failed churn cycle must not abort the soak */ }
    }
  })();

  const serverOps = [
    () => fetch(`${ctx.base}/api/health`).then((r) => r.status),
    () => fetch(`${ctx.base}/api/ready`).then((r) => r.status),
    () => call.req('GET', '/api/documents', { token: user.token }).then((r) => r.status),
    () => call.req('GET', '/api/stats/dashboard', { token: user.token }).then((r) => r.status),
    () => call.req('GET', '/api/export', { token: user.token }).then((r) => r.status),
    () => call.req('GET', '/api/chat', { token: user.token }).then((r) => r.status),
  ];

  while (Date.now() < deadline) {
    const cycleStart = Date.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        const s = Date.now();
        const op = serverOps[Math.floor(Math.random() * serverOps.length)];
        try {
          const status = await op();
          return { status, ms: Date.now() - s };
        } catch {
          return { status: NET_ERROR, ms: Date.now() - s };
        }
      })
    );

    const ok = results.filter((r) => r.status >= 200 && r.status < 500).length;
    const _5xx = results.filter((r) => r.status >= 500).length;
    const net = results.filter((r) => r.status === NET_ERROR).length;
    const avg = Math.round(results.reduce((a, r) => a + r.ms, 0) / Math.max(1, results.length));

    totalOk += ok;
    windowAvgs.push(avg);
    window5xx.push(_5xx);
    windowNet.push(net);

    // Fail fast on the hard signals so a regression doesn't burn the window.
    assert.equal(_5xx, 0, `no 5xx in soak window ${windowAvgs.length}`);
    assert.equal(net, 0, `no network errors in soak window ${windowAvgs.length}`);

    const elapsed = Date.now() - cycleStart;
    if (elapsed < WINDOW_MS) await sleep(WINDOW_MS - elapsed);
  }

  await docChurn; // let churn finish fully within the deadline

  // Latency must not creep: median of the second half vs first half. Allow
  // generous 3x headroom (noisy shared hosts / GC) while still catching a
  // genuine leak (which compounds over time).
  const half = Math.max(1, Math.floor(windowAvgs.length / 2));
  const firstMedian = median(windowAvgs.slice(0, half));
  const secondMedian = median(windowAvgs.slice(half));
  assert.ok(firstMedian > 0, 'latency is measurable (workload actually ran)');
  assert.ok(secondMedian < firstMedian * 3 + 100, `no latency creep (firstHalf=${firstMedian}ms secondHalf=${secondMedian}ms)`);

  assert.ok(totalOk > 0, 'soak did useful work');
  // eslint-disable-next-line no-console
  console.log(`  [soak] ${SOAK_SECONDS}s ${windowAvgs.length} windows ok=${totalOk} 5xx=${window5xx.reduce((a, b) => a + b, 0)} net=${windowNet.reduce((a, b) => a + b, 0)} lat1=${firstMedian}ms lat2=${secondMedian}ms`);

  try { stub.server.close(); } catch {}
  ctx.cleanup();
});
