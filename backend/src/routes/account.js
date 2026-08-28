// Account routes: data export handled separately; here account deletion.

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { AccountService } from '../services/accountService.js';
import { ok } from '../errors.js';

const router = express.Router();
const accountService = new AccountService();

// Admin feature: delete the user's own account and all data.
router.delete('/', authenticate, async (req, res, next) => {
  try {
    const result = await accountService.deleteAccount(req.user.userId);
    return ok(res, { message: 'Account deleted', ...result });
  } catch (err) { return next(err); }
});

export default router;
