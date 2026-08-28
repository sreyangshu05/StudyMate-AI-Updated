// Data export: returns the authenticated user's own data as a structured document
// (downloadable JSON with a stable filename). Ownership is enforced by using the
// authenticated user id everywhere.

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { ExportService } from '../services/exportService.js';
import { ok } from '../errors.js';

const router = express.Router();
const exportService = new ExportService();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const data = await exportService.exportUserData(req.user.userId);
    return ok(res, data);
  } catch (err) { return next(err); }
});

export default router;
