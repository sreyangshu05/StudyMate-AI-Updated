// YouTube integration is DISABLED.
//
// The previous implementation returned fabricated videos (fake video ids, fake
// view counts) which must not be presented as real recommendations. Real
// integration requires server-side credentials and quota handling. It is not
// currently configured, so these endpoints report a clear 503 instead of mock data.

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import config from '../config.js';
import { ProviderError } from '../errors.js';

const router = express.Router();

function disabled(_req, res) {
  if (!config.youtubeEnabled || !config.youtubeApiKey) {
    const error = new ProviderError(
      'YouTube recommendations are not configured. Set YOUTUBE_ENABLED=true and YOUTUBE_API_KEY to enable real integration.'
    );
    error.status = 503;
    error.code = 'FEATURE_DISABLED';
    return res.status(503).json({
      success: false,
      error: { code: 'FEATURE_DISABLED', message: error.message },
    });
  }
  return res.status(503).json({
    success: false,
    error: { code: 'FEATURE_DISABLED', message: 'YouTube integration is not ready for production use.' },
  });
}

router.get('/recommendations', authenticate, disabled);
router.get('/trending', authenticate, disabled);

export default router;
