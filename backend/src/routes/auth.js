// Auth routes: register, login, me, change-password, logout (client token discard).
// Rate-limited to slow brute force. Uniform error messages resist enumeration.

import express from 'express';
import { register, login, changePassword, findUserById } from '../services/authService.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validateEmailFormat } from '../validation.js';
import config from '../config.js';
import { ok, ValidationError } from '../errors.js';

const router = express.Router();

router.post('/register',
  rateLimit({ windowMs: config.rateLimit.authWindowMs, max: config.rateLimit.register, keyPrefix: 'reg' }),
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      const result = await register({ name, email, password });
      return ok(res, result, 201);
    } catch (err) { return next(err); }
  }
);

router.post('/login',
  rateLimit({ windowMs: config.rateLimit.authWindowMs, max: config.rateLimit.login, keyPrefix: 'login' }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await login({ email, password });
      return ok(res, result);
    } catch (err) { return next(err); }
  }
);

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await findUserById(req.user.userId);
    return ok(res, { user });
  } catch (err) { return next(err); }
});

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await changePassword(req.user.userId, { currentPassword, newPassword });
    return ok(res, result);
  } catch (err) { return next(err); }
});

// Update profile (name). Email immutability keeps indexing simple and safe.
router.patch('/profile', authenticate, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return next(new ValidationError('Name must be 2-100 characters'));
    }
    const { getDatabase } = await import('../services/database.js');
    const db = getDatabase();
    await db.run('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name.trim(), req.user.userId]);
    const user = await findUserById(req.user.userId);
    return ok(res, { user });
  } catch (err) { return next(err); }
});

// Logout is a client-side token discard (stateless JWT). Endpoint documents intent.
router.post('/logout', (_req, res) => ok(res, { message: 'Logged out' }));

export default router;
