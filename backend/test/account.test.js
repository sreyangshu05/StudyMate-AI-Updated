// Account deletion: complete, idempotent cleanup of all owned data, and no
// cross-user data is touched. After deletion the tokens stop working.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestApp, api, startStubAIProvider, useStubAI, drainIngestQueue } from './helpers.js';
import { makeMultiPagePdf } from './pdfgen.js';

let ctx, call, stub, db;

before(async () => {
  ctx = await setupTestApp();
  call = api(ctx.base);
  stub = await startStubAIProvider();
  await useStubAI(stub.baseURL);
  const { getDatabase } = await import('../src/services/database.js');
  db = getDatabase();
});

after(async () => {
  try { stub.server.close(); } catch {}
  ctx.cleanup();
});

async function seedUser(email) {
  const u = await call.register('Victim', email);
  // add a doc + ingest
  const form = new FormData();
  const pdfBuf = await makeMultiPagePdf(['physics sensitive']);
  form.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'doc.pdf');
  const up = await (await fetch(`${ctx.base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}` }, body: form })).json();
  const docId = up.data.docId;
  await call.req('POST', '/api/documents/ingest', { token: u.token, body: { docId } });
  await drainIngestQueue();
  // a chat + message
  const chat = await call.req('POST', '/api/chat', { token: u.token, body: {} });
  const chatId = chat.json.data.chatId;
  await call.req('POST', `/api/chat/${chatId}/messages`, { token: u.token, body: { message: 'private' } });
  return { u, docId, chatId };
}

test('account deletion removes all owned data and invalidates tokens', async () => {
  const { u } = await seedUser('del@acct.com');
  const del = await call.req('DELETE', '/api/account', { token: u.token });
  assert.equal(del.status, 200);

  const users = await db.get('SELECT id FROM users WHERE id = ?', [u.user.id]);
  assert.equal(users, undefined);
  const docs = await db.all('SELECT id FROM documents WHERE user_id = ?', [u.user.id]);
  assert.equal(docs.length, 0);
  const passages = await db.all('SELECT id FROM passages WHERE user_id = ?', [u.user.id]);
  assert.equal(passages.length, 0);
  const chats = await db.all('SELECT id FROM chats WHERE user_id = ?', [u.user.id]);
  assert.equal(chats.length, 0);

  // token no longer works
  const me = await call.req('GET', '/api/auth/me', { token: u.token });
  assert.equal(me.status, 401);
});

test('account deletion does not touch other users data', async () => {
  const keeper = await call.register('Keeper', 'keeper@acct.com');
  const form = new FormData();
  const pdfBuf = await makeMultiPagePdf(['physics keep me']);
  form.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'doc.pdf');
  const up = await (await fetch(`${ctx.base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${keeper.token}` }, body: form })).json();
  const keeperDoc = up.data.docId;

  const { u } = await seedUser('boom@acct.com');
  await call.req('DELETE', '/api/account', { token: u.token });

  // keeper's doc survives
  const still = await call.req('GET', `/api/documents/${keeperDoc}`, { token: keeper.token });
  assert.equal(still.status, 200);
});

test('account deletion is idempotent (second delete 404)', async () => {
  const { u } = await seedUser('twice@acct.com');
  await call.req('DELETE', '/api/account', { token: u.token });
  // second attempt with same token -> 401 (token no longer valid) or 404
  const second = await call.req('DELETE', '/api/account', { token: u.token });
  assert.ok([401, 404].includes(second.status));
});
