// Auth route tests: register, login, me, change-password, profile, logout.
// Covers enumeration resistance, password validation, token issuance.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestApp, api } from './helpers.js';

let ctx;
let call;

before(async () => {
  ctx = await setupTestApp();
  call = api(ctx.base);
});

after(() => ctx.cleanup());

test('register a new user returns 201 + token', async () => {
  const r = await call.register('Sabita', 'sabita@example.com');
  assert.equal(r.status, 201);
  assert.equal(r.error, undefined);
  assert.ok(r.json.success);
  assert.ok(r.token);
  assert.equal(r.user.name, 'Sabita');
});

test('register duplicate email returns 409 without leaking existence', async () => {
  await call.register('One', 'dup@example.com');
  const r = await call.register('Two', 'dup@example.com');
  assert.equal(r.status, 409);
  assert.equal(r.json.success, false);
  // Enumeration-resistant message, no "already exists".
  assert.equal(r.json.error.code, 'CONFLICT');
  assert.equal(r.json.error.message, 'Registration failed. Please try again.');
});

test('register rejects invalid email format', async () => {
  const r = await call.req('POST', '/api/auth/register', { body: { name: 'X', email: 'notanemail', password: 'StrongPass123' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION_ERROR');
});

test('register rejects weak password', async () => {
  const r = await call.req('POST', '/api/auth/register', { body: { name: 'X', email: 'weak@example.com', password: 'short' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION_ERROR');
});

test('login succeeds with correct credentials', async () => {
  await call.register('Login', 'login@example.com');
  const r = await call.login('login@example.com', 'StrongPass123');
  assert.equal(r.status, 200);
  assert.ok(r.token);
});

test('login fails with wrong password (401)', async () => {
  await call.register('Login2', 'login2@example.com');
  const r = await call.login('login2@example.com', 'WrongPass999');
  assert.equal(r.status, 401);
  assert.equal(r.json.error.code, 'AUTHENTICATION_REQUIRED');
});

test('/me requires auth', async () => {
  const r = await call.req('GET', '/api/auth/me');
  assert.equal(r.status, 401);
  assert.equal(r.json.error.code, 'AUTHENTICATION_REQUIRED');
});

test('/me returns current user with valid token', async () => {
  const u = await call.register('Me', 'me@example.com');
  const r = await call.req('GET', '/api/auth/me', { token: u.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.user.email, 'me@example.com');
});

test('change-password requires current password to match', async () => {
  const u = await call.register('Cp', 'cp@example.com');
  const r = await call.req('POST', '/api/auth/change-password', { token: u.token, body: { currentPassword: 'wrong', newPassword: 'NewPass123' } });
  assert.equal(r.status, 401);
});

test('change-password works and new password logs in', async () => {
  const u = await call.register('Cp2', 'cp2@example.com');
  const r = await call.req('POST', '/api/auth/change-password', { token: u.token, body: { currentPassword: 'StrongPass123', newPassword: 'NewPass456' } });
  assert.equal(r.status, 200);
  const old = await call.login('cp2@example.com', 'StrongPass123');
  assert.equal(old.status, 401);
  const neo = await call.login('cp2@example.com', 'NewPass456');
  assert.equal(neo.status, 200);
});

test('PATCH /profile updates name but not email', async () => {
  const u = await call.register('Prof', 'prof@example.com');
  const r = await call.req('PATCH', '/api/auth/profile', { token: u.token, body: { name: 'Updated Name' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.user.name, 'Updated Name');
  assert.equal(r.json.data.user.email, 'prof@example.com');
});

test('logout returns 200 (stateless discard)', async () => {
  const u = await call.register('Lo', 'lo@example.com');
  const r = await call.req('POST', '/api/auth/logout', { token: u.token });
  assert.equal(r.status, 200);
});

test('invalid token is rejected', async () => {
  const r = await call.req('GET', '/api/auth/me', { token: 'garbage.token.here' });
  assert.equal(r.status, 401);
});
