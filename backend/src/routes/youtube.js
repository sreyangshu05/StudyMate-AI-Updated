// YouTube integration — real YouTube Data API v3, feature-gated.
//
// When YOUTUBE_ENABLED=true and YOUTUBE_API_KEY are set, endpoints return real
// video data from the YouTube Data API v3 (server-side, no client-side keys).
// When disabled (the default), endpoints return 503 FEATURE_DISABLED.
// No mock/fabricated data is ever returned.

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import config from '../config.js';
import { ProviderError } from '../errors.js';
import { getRecommendations, getTrending } from '../services/youtubeService.js';

const router = express.Router();

// Wrap async handlers so errors propagate to the error middleware (which maps
// ProviderError to the right status + code).
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function disabled(res) {
  return res.status(503).json({
    success: false,
    error: {
      code: 'FEATURE_DISABLED',
      message:
        'YouTube recommendations are not configured. Set YOUTUBE_ENABLED=true and YOUTUBE_API_KEY to enable real integration.',
    },
  });
}

router.get(
  '/recommendations',
  authenticate,
  wrap(async (req, res) => {
    if (!config.youtubeEnabled || !config.youtubeApiKey) return disabled(res);
    const { topic, maxResults } = req.query;
    const videos = await getRecommendations(topic, maxResults);
    res.json({ success: true, data: { videos } });
  })
);

router.get(
  '/trending',
  authenticate,
  wrap(async (req, res) => {
    if (!config.youtubeEnabled || !config.youtubeApiKey) return disabled(res);
    const { category, maxResults } = req.query;
    const videos = await getTrending(category, maxResults);
    res.json({ success: true, data: { videos } });
  })
);

export default router;
