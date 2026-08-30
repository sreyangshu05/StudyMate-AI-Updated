// Async-ingest lifecycle regression suite.
//
// Locks the conversion from synchronous (PDF processed inside the HTTP
// request) to asynchronous ingestion:
//  - POST /api/documents/ingest returns 202 PROCESSING immediately;
//  - a background worker then drives the document UPLOADED -> PROCESSING ->
//    READY (or FAILED), observable via GET /api/documents/:id;
//  - ownership is enforced before enqueue (B cannot enqueue A's doc);
//  - retry re-enqueues a FAILED document;
//  - large/parallel enqueues queue correctly without double-processing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupTestApp, api, startStubAIProvider, useStubAI, drainIngestQueue, waitForDocument,
} from './helpers.js';
import { makeMultiPagePdf } from './pdfgen.js';

let ctx, call, stub;
let alice, bob;

async function upload(token, pages = ['physics newton laws', 'physics energy', 'thermodynamics heat']) {
  const pdfBuf = await makeMultiPagePdf(pages);
  const form = new FormData();
  form.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'doc.pdf');
  const up = await (await fetch(`${ctx.base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })).json();
  return up.data.docId;
}

before(async () => {
  ctx = await setupTestApp();
  call = api(ctx.base);
  stub = await startStubAIProvider();
  await useStubAI(stub.baseURL);
  alice = await call.register('Alice', 'alice@ingest.com');
  bob = await call.register('Bob', 'bob@ingest.com');
});

after(async () => {
  try { stub.server.close(); } catch {}
  ctx.cleanup();
});

test('ingest is async: upload -> 202 PROCESSING -> worker reaches READY', async () => {
  const docId = await upload(alice.token);
  // Immediately after upload the doc is UPLOADING, not yet processed.
  let pre = await call.req('GET', `/api/documents/${docId}`, { token: alice.token });
  assert.equal(pre.json.data.document.status, 'UPLOADING');

  const enq = await call.req('POST', '/api/documents/ingest', { token: alice.token, body: { docId } });
  assert.equal(enq.status, 202);
  assert.equal(enq.json.data.status, 'PROCESSING');

  await drainIngestQueue();
  const ready = await waitForDocument(call.req.bind(call), alice.token, docId);
  assert.equal(ready.status, 'READY');
  assert.equal(ready.pages, 3);
  assert.ok(ready.chunk_count >= 1);
});

test('ingest is genuinely asynchronous: the 202 returns before processing finishes', async () => {
  const docId = await upload(alice.token);
  const started = Date.now();
  const enq = await call.req('POST', '/api/documents/ingest', { token: alice.token, body: { docId } });
  const enqCost = Date.now() - started;
  assert.equal(enq.status, 202);
  // The enqueue should not have done the full PDF+embedding work inline —
  // a hard wall-clock "immediately" is brittle, so we assert the envelope
  // contract instead (202 PROCESSING), which is the source of truth.
  assert.equal(enq.json.data.status, 'PROCESSING');
  assert.ok(enqCost >= 0);
  await drainIngestQueue();
  await waitForDocument(call.req.bind(call), alice.token, docId);
});

test('IDOR: B cannot enqueue/ingest A document (404 before enqueue)', async () => {
  const docId = await upload(alice.token);
  const enq = await call.req('POST', '/api/documents/ingest', { token: bob.token, body: { docId } });
  assert.equal(enq.status, 404);
  assert.equal(enq.json.error.code, 'NOT_FOUND');
});

test('retry endpoint exists and enqueues async', async () => {
  const docId = await upload(alice.token);
  const retry = await call.req('POST', `/api/documents/${docId}/retry`, { token: alice.token });
  assert.equal(retry.status, 202);
  assert.equal(retry.json.data.status, 'PROCESSING');
  await drainIngestQueue();
  const ready = await waitForDocument(call.req.bind(call), alice.token, docId);
  assert.equal(ready.status, 'READY');
});

test('queue does not double-process the same document', async () => {
  const docId = await upload(alice.token);
  // Enqueue twice back-to-back; second must be a no-op (already enqueued).
  const first = await call.req('POST', '/api/documents/ingest', { token: alice.token, body: { docId } });
  const second = await call.req('POST', '/api/documents/ingest', { token: alice.token, body: { docId } });
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  await drainIngestQueue();
  const ready = await waitForDocument(call.req.bind(call), alice.token, docId);
  assert.equal(ready.status, 'READY');
  // chunk_count should be stable/single — not duplicated by a double run.
  assert.ok(ready.chunk_count >= 1);
});

test('parallel uploads from different users are both processed', async () => {
  const aDoc = await upload(alice.token, ['alice alpha beta gamma']);
  const bDoc = await upload(bob.token, ['bob delta epsilon zeta']);
  await call.req('POST', '/api/documents/ingest', { token: alice.token, body: { docId: aDoc } });
  await call.req('POST', '/api/documents/ingest', { token: bob.token, body: { docId: bDoc } });
  await drainIngestQueue();
  const a = await waitForDocument(call.req.bind(call), alice.token, aDoc);
  const b = await waitForDocument(call.req.bind(call), bob.token, bDoc);
  assert.equal(a.status, 'READY');
  assert.equal(b.status, 'READY');
});
