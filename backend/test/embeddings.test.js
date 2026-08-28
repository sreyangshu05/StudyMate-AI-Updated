// Embedding / retrieval tests at the service level (using a real test DB):
//  - store -> search roundtrip with ownership scoping
//  - retrieval drops non-owned doc ids
//  - empty docIds defaults to the user's own docs only
//  - deletePassagesForDoc removes rows
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupTestApp, api, startStubAIProvider, useStubAI, drainIngestQueue, waitForDocument,
} from './helpers.js';
import { makeMultiPagePdf } from './pdfgen.js';

let ctx, call, stub, db;
let alice, bob;

// Upload a PDF and drive async ingest to completion, returning the docId and
// the post-ingest document record (READY).
async function uploadAndIngest(token, pages) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(makeMultiPagePdf(pages))], { type: 'application/pdf' }), 'doc.pdf');
  const up = await (await fetch(`${ctx.base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })).json();
  const docId = up.data.docId;
  const ig = await call.req('POST', '/api/documents/ingest', { token, body: { docId } });
  await drainIngestQueue();
  const doc = await waitForDocument(call.req.bind(call), token, docId);
  return { docId, ingest: ig, doc };
}

before(async () => {
  ctx = await setupTestApp();
  call = api(ctx.base);
  stub = await startStubAIProvider();
  await useStubAI(stub.baseURL);
  const { getDatabase } = await import('../src/services/database.js');
  db = getDatabase();
  alice = await call.register('Alice', 'alice@emb.com');
  bob = await call.register('Bob', 'bob@emb.com');
});

after(async () => {
  try { stub.server.close(); } catch {}
  ctx.cleanup();
});

test('ingest enqueues async (202) and produces READY with real per-page chunks', async () => {
  const { ingest, doc } = await uploadAndIngest(alice.token, ['physics newton laws of motion', 'physics energy conservation principles', 'thermodynamics heat physics concepts terminology']);
  // Async by design: the ingest call returns 202 PROCESSING, not READY.
  assert.equal(ingest.status, 202);
  assert.equal(ingest.json.data.status, 'PROCESSING');
  // After draining the queue the document is READY with real page count.
  assert.equal(doc.status, 'READY');
  assert.equal(doc.pages, 3);
  assert.ok(doc.chunk_count >= 1);
});

test('search finds the user own doc and stays within the user scope', async () => {
  const { docId } = await uploadAndIngest(alice.token, ['physics projectile motion', 'physics momentum laws']);
  const { EmbeddingService } = await import('../src/services/embeddingService.js');
  const emb = new EmbeddingService(ctx.uploadsDir);
  const res = await emb.search({ query: 'physics momentum', userId: alice.user.id, docIds: [docId], topK: 2 });
  assert.ok(res.length > 0);
  // every returned passage must be from Alice's doc
  for (const p of res) assert.equal(p.docId, docId);
});

test('ownership: querying with another users doc id drops it', async () => {
  const { docId } = await uploadAndIngest(alice.token, ['physics optics principles']);
  const { EmbeddingService } = await import('../src/services/embeddingService.js');
  const emb = new EmbeddingService(ctx.uploadsDir);
  // Bob passes Alice's docId: ownership scoping must NOT return Alice's passages.
  const res = await emb.search({ query: 'Optics', userId: bob.user.id, docIds: [docId], topK: 5 });
  for (const p of res) assert.notEqual(p.docId, docId);
});

test('empty docIds searches only the users own docs', async () => {
  await uploadAndIngest(alice.token, ['Kinematics']);
  await uploadAndIngest(bob.token, ['Kinematics For Bob']);
  const { EmbeddingService } = await import('../src/services/embeddingService.js');
  const emb = new EmbeddingService(ctx.uploadsDir);
  const aliceDocs = (await db.all('SELECT id FROM documents WHERE user_id = ?', [alice.user.id])).map((r) => r.id);
  const res = await emb.search({ query: 'Kinematics', userId: alice.user.id, topK: 10 });
  assert.ok(res.length > 0);
  // ownership scoping with no docIds must never return Bob's docs
  for (const p of res) {
    assert.ok(aliceDocs.includes(p.docId), `passage from unowned doc ${p.docId} leaked`);
  }
});

test('deletePassagesForDoc removes the docs passages', async () => {
  const { docId } = await uploadAndIngest(alice.token, ['Thermodynamics']);
  const { EmbeddingService } = await import('../src/services/embeddingService.js');
  const emb = new EmbeddingService(ctx.uploadsDir);
  await emb.deletePassagesForDoc(docId);
  const res = await emb.search({ query: 'Thermodynamics', userId: alice.user.id, docIds: [docId], topK: 5 });
  assert.equal(res.length, 0);
});
