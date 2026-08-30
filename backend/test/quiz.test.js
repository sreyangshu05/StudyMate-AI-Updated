// Quiz suite — locks the P1 grading regression and answer-security contract:
//  - correct answers are NEVER returned by buildQuiz (pre-submission)
//  - submission is graded server-side against stored correct answers
//  - ownership: B cannot get/submit/delete A's quiz
//  - invalid question ids in an attempt are rejected
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupTestApp, api, startStubAIProvider, useStubAI, drainIngestQueue, waitForDocument,
} from './helpers.js';
import { makeMultiPagePdf } from './pdfgen.js';

let ctx, call, stub;
let alice, bob, docId;

// Upload a PDF for Alice and drive async ingest to READY. Returns the docId.
async function uploadIngestAlice(pages = ['physics newton laws of motion', 'physics energy conservation principles', 'thermodynamics heat physics concepts terminology']) {
  const pdfBuf = await makeMultiPagePdf(pages);
  const form = new FormData();
  form.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'doc.pdf');
  const up = await (await fetch(`${ctx.base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${alice.token}` }, body: form })).json();
  const id = up.data.docId;
  await call.req('POST', '/api/documents/ingest', { token: alice.token, body: { docId: id } });
  await drainIngestQueue();
  return id;
}

before(async () => {
  ctx = await setupTestApp();
  call = api(ctx.base);
  stub = await startStubAIProvider();
  await useStubAI(stub.baseURL);
  alice = await call.register('Alice', 'alice@quiz.com');
  bob = await call.register('Bob', 'bob@quiz.com');

  const pdfBuf = await makeMultiPagePdf(['physics newton laws of motion', 'physics energy conservation principles', 'thermodynamics heat physics concepts terminology']);
  const form = new FormData();
  form.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'doc.pdf');
  const up = await (await fetch(`${ctx.base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${alice.token}` }, body: form })).json();
  docId = up.data.docId;
  await call.req('POST', '/api/documents/ingest', { token: alice.token, body: { docId } });
  await drainIngestQueue();
  await waitForDocument(call.req.bind(call), alice.token, docId);
});

after(async () => {
  try { stub.server.close(); } catch {}
  ctx.cleanup();
});

test('generate a quiz returns 201 with questions', async () => {
  const r = await call.req('POST', '/api/quiz/generate', {
    token: alice.token,
    body: { docIds: [docId], numQuestions: 3, distribution: { mcq: 3, saq: 0, laq: 0 } },
  });
  assert.equal(r.status, 201);
  assert.ok(r.json.success);
  assert.ok(r.json.data.quizId);
  assert.ok(Array.isArray(r.json.data.quiz.questions));
  assert.equal(r.json.data.quiz.questions.length, 3);
});

test('generate a default-size quiz stays within retrieval topK limits', async () => {
  const r = await call.req('POST', '/api/quiz/generate', {
    token: alice.token,
    body: { docIds: [docId], numQuestions: 10, distribution: { mcq: 6, saq: 3, laq: 1 } },
  });
  assert.equal(r.status, 201);
  assert.ok(r.json.data.quiz.questions.length > 0);
});

test('GET quiz does NOT expose correct answers pre-submission', async () => {
  // generate fresh quiz
  const gen = await call.req('POST', '/api/quiz/generate', {
    token: alice.token, body: { docIds: [docId], numQuestions: 2, distribution: { mcq: 2, saq: 0, laq: 0 } },
  });
  const quizId = gen.json.data.quizId;
  const r = await call.req('GET', `/api/quiz/${quizId}`, { token: alice.token });
  const q = r.json.data.quiz;
  assert.equal(r.status, 200);
  for (const question of q.questions) {
    assert.ok(!('correctIndex' in question), 'correctIndex must not leak');
    assert.ok(!('correct_index' in question), 'correct_index must not leak');
    assert.ok(!('correctAnswer' in question), 'correctAnswer must not leak');
  }
});

test('submitting correct MCQ answers scores correctly (server-authoritative)', async () => {
  const gen = await call.req('POST', '/api/quiz/generate', {
    token: alice.token, body: { docIds: [docId], numQuestions: 3, distribution: { mcq: 3, saq: 0, laq: 0 } },
  });
  const quiz = gen.json.data.quiz;
  const quizId = gen.json.data.quizId;
  // We know the stub always sets correct_index and the 4 choices; the stub
  // selects correct_index i%4. Re-derive by asking the DB (server-side trusted).
  const { getDatabase } = await import('../src/services/database.js');
  const db = getDatabase();
  const questions = await db.all('SELECT id, correct_answer FROM questions WHERE quiz_id = ?', [quizId]);
  const answers = {};
  for (const q of questions) answers[q.id] = q.correct_answer;
  const attempt = await call.req('POST', `/api/quiz/${quizId}/attempt`, { token: alice.token, body: { answers } });
  assert.equal(attempt.status, 201);
  assert.equal(attempt.json.data.correctCount, questions.length);
  assert.equal(attempt.json.data.score, 100);
});

test('submitting wrong answers yields non-perfect, graded results', async () => {
  const gen = await call.req('POST', '/api/quiz/generate', {
    token: alice.token, body: { docIds: [docId], numQuestions: 2, distribution: { mcq: 2, saq: 0, laq: 0 } },
  });
  const quizId = gen.json.data.quizId;
  const { getDatabase } = await import('../src/services/database.js');
  const db = getDatabase();
  const questions = await db.all('SELECT id, choices, correct_index FROM questions WHERE quiz_id = ?', [quizId]);
  const answers = {};
  for (const q of questions) {
    const choices = JSON.parse(q.choices);
    // choose a guaranteed-wrong index: (correct_index + 1) mod choices.length
    const wrongIdx = (Number(q.correct_index) + 1) % choices.length;
    answers[q.id] = choices[wrongIdx];
  }
  const attempt = await call.req('POST', `/api/quiz/${quizId}/attempt`, { token: alice.token, body: { answers } });
  assert.equal(attempt.status, 201);
  assert.ok(attempt.json.data.correctCount < questions.length);
  assert.ok(attempt.json.data.results.every((x) => x.isCorrect === false));
});

test('IDOR: B cannot get A quiz, submit A quiz, or delete A quiz (404)', async () => {
  const gen = await call.req('POST', '/api/quiz/generate', {
    token: alice.token, body: { docIds: [docId], numQuestions: 1, distribution: { mcq: 1, saq: 0, laq: 0 } },
  });
  const quizId = gen.json.data.quizId;
  const get = await call.req('GET', `/api/quiz/${quizId}`, { token: bob.token });
  assert.equal(get.status, 404);
  const submit = await call.req('POST', `/api/quiz/${quizId}/attempt`, { token: bob.token, body: { answers: { 1: 'x' } } });
  assert.equal(submit.status, 404);
  const del = await call.req('DELETE', `/api/quiz/${quizId}`, { token: bob.token });
  assert.equal(del.status, 404);
});

test('attempt with unknown question id is rejected', async () => {
  const gen = await call.req('POST', '/api/quiz/generate', {
    token: alice.token, body: { docIds: [docId], numQuestions: 2, distribution: { mcq: 2, saq: 0, laq: 0 } },
  });
  const quizId = gen.json.data.quizId;
  const { getDatabase } = await import('../src/services/database.js');
  const db = getDatabase();
  const questions = await db.all('SELECT id, correct_answer FROM questions WHERE quiz_id = ?', [quizId]);
  const answers = {};
  for (const q of questions) answers[q.id] = q.correct_answer;
  const r = await call.req('POST', `/api/quiz/${quizId}/attempt`, {
    token: alice.token, body: { answers: { ...answers, 999999: 'hack' } },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION_ERROR');
});
