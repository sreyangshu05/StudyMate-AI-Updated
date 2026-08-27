// Centralized validation edge cases. These run against pure functions (no
// server needed) so they're fast and exhaustive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseId, validateDocIds, validateTopK, validateText, validateQuizConfig,
  validateAnswers, validateEmailFormat,
} from '../src/validation.js';

test('parseId accepts positive integer', () => {
  assert.equal(parseId('42'), 42);
});

test('parseId rejects 0, negatives, floats, non-numeric', () => {
  assert.throws(() => parseId('0'), /positive integer/);
  assert.throws(() => parseId('-3'), /positive integer/);
  assert.throws(() => parseId('1.5'), /positive integer/);
  assert.throws(() => parseId('abc'), /positive integer/);
  assert.throws(() => parseId(''), /required/);
  assert.throws(() => parseId(undefined), /required/);
});

test('validateDocIds handles empty + undefined', () => {
  assert.deepEqual(validateDocIds(undefined), []);
  assert.deepEqual(validateDocIds(null), []);
  assert.deepEqual(validateDocIds([]), []);
});

test('validateDocIds rejects non-array / non-int / negative', () => {
  assert.throws(() => validateDocIds('1'), /array/);
  assert.throws(() => validateDocIds([1.5]), /positive integer/);
  assert.throws(() => validateDocIds([-1]), /positive integer/);
});

test('validateDocIds dedupes-rejects duplicates', () => {
  assert.throws(() => validateDocIds([1, 1]), /Duplicate/);
});

test('validateDocIds respects maxSelectedDocs', () => {
  // default maxSelectedDocs is 10; 11 exceeds it
  assert.throws(() => validateDocIds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), /Cannot select more than/);
});

test('validateTopK defaults + bounds', () => {
  assert.equal(validateTopK(undefined), 4); // defaultTopK
  assert.equal(validateTopK('3'), 3);
  assert.throws(() => validateTopK(0), /positive integer/);
  assert.throws(() => validateTopK(1000), /cannot exceed/);
});

test('validateText trims and bounds', () => {
  assert.equal(validateText('  hello  '), 'hello');
  assert.throws(() => validateText(''), /must not be empty/);
  assert.throws(() => validateText(undefined), /required/);
  assert.throws(() => validateText(123), /must be a string/);
});

test('validateQuizConfig defaults distribution to sum', () => {
  const c = validateQuizConfig({ numQuestions: 10 });
  assert.equal(c.numQuestions, 10);
  assert.equal(c.distribution.mcq + c.distribution.saq + c.distribution.laq, 10);
});

test('validateQuizConfig rejects mismatched sum', () => {
  assert.throws(() => validateQuizConfig({ numQuestions: 10, distribution: { mcq: 2, saq: 2, laq: 2 } }), /must sum to 10/);
});

test('validateQuizConfig rejects negative counts and zero-total', () => {
  assert.throws(() => validateQuizConfig({ numQuestions: 4, distribution: { mcq: 4, saq: -1 } }), /non-negative integer/);
  assert.throws(() => validateQuizConfig({ numQuestions: 0 }), /positive integer/);
});

test('validateQuizConfig caps at maxQuizQuestions', () => {
  assert.throws(() => validateQuizConfig({ numQuestions: 99999 }), /cannot exceed/);
});

test('validateAnswers canonical map', () => {
  const out = validateAnswers({ 3: 'choice B', 7: 'an essay answer' });
  assert.deepEqual(out, { 3: 'choice B', 7: 'an essay answer' });
});

test('validateAnswers rejects bad shapes', () => {
  assert.throws(() => validateAnswers([]), /object mapping/);
  assert.throws(() => validateAnswers({}), /at least one/);
  assert.throws(() => validateAnswers({ x: 'hi' }), /Invalid question id/);
  assert.throws(() => validateAnswers({ 1: '' }), /non-empty string/);
  assert.throws(() => validateAnswers({ 1: 42 }), /non-empty string/);
});

test('validateEmailFormat normalizes + validates', () => {
  assert.equal(validateEmailFormat('  Foo@Bar.com '), 'foo@bar.com');
  assert.throws(() => validateEmailFormat('not an email'), /valid email/);
  assert.throws(() => validateEmailFormat('a@b'), /valid email/);
});
