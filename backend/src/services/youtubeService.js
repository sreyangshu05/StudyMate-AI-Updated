// YouTube Data API v3 integration (server-side, feature-gated).
//
// Enabled only when config.youtubeEnabled && config.youtubeApiKey are set.
// When disabled, the route layer returns 503 FEATURE_DISABLED — this service
// is never called. No mock/fabricated data is ever returned: either real API
// results or an error.

import config from '../config.js';
import { ProviderError } from '../errors.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_CAP = 50; // YouTube API max per request

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded-retry fetch wrapper. Retries on 429 and 5xx with exponential
 * backoff (same pattern as the AI client). Never retries 4xx (except 429).
 */
async function fetchWithRetry(url, { label = 'youtube api', maxRetries = 2 } = {}) {
  const attempts = maxRetries + 1;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return res;
      const body = await res.text().catch(() => '');
      const err = new ProviderError(
        `YouTube API error ${res.status}: ${body.slice(0, 200)}`
      );
      err.status = res.status;
      err.code = res.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR';
      const retriable = res.status === 429 || (res.status >= 500 && res.status <= 599);
      if (attempt === attempts || !retriable) throw err;
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await sleep(backoff);
      lastErr = err;
    } catch (err) {
      if (err instanceof ProviderError) throw err; // already processed
      lastErr = err;
      if (attempt === attempts) {
        const wrapped = new ProviderError(
          `YouTube API request failed: ${err.message}`
        );
        wrapped.code = 'NETWORK_ERROR';
        throw wrapped;
      }
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function clampMaxResults(n) {
  const parsed = parseInt(n, 10);
  if (!parsed || parsed < 1) return DEFAULT_MAX_RESULTS;
  return Math.min(parsed, MAX_RESULTS_CAP);
}

/**
 * Fetch video recommendations for a study topic.
 * Uses the search endpoint, then enriches with statistics from the videos
 * endpoint (view counts, likes) so the frontend gets rich data.
 *
 * @param {string} topic - The study topic to search for.
 * @param {number} maxResults - Max videos to return (1-50, default 10).
 * @returns {Promise<Array>} Array of video objects.
 */
export async function getRecommendations(topic, maxResults = DEFAULT_MAX_RESULTS) {
  ensureEnabled();

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    const err = new ProviderError('A topic query is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const n = clampMaxResults(maxResults);
  const q = encodeURIComponent(topic.trim());
  const searchUrl =
    `${YOUTUBE_API_BASE}/search?part=snippet&q=${q}&type=video` +
    `&maxResults=${n}&relevanceLanguage=en&key=${config.youtubeApiKey}`;

  const searchRes = await fetchWithRetry(searchUrl, { label: 'youtube search' });
  const searchData = await searchRes.json();

  if (!searchData.items || !Array.isArray(searchData.items)) {
    return [];
  }

  const videoIds = searchData.items
    .map((item) => item.id?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) return [];

  // Enrich with statistics (views, likes, duration).
  const idsParam = videoIds.join(',');
  const videosUrl =
    `${YOUTUBE_API_BASE}/videos?part=statistics,snippet,contentDetails` +
    `&id=${idsParam}&key=${config.youtubeApiKey}`;

  const videosRes = await fetchWithRetry(videosUrl, { label: 'youtube videos' });
  const videosData = await videosRes.json();

  const statsById = new Map();
  if (videosData.items) {
    for (const v of videosData.items) {
      statsById.set(v.id, v);
    }
  }

  return searchData.items
    .filter((item) => item.id?.videoId)
    .map((item) => {
      const id = item.id.videoId;
      const enriched = statsById.get(id);
      const stats = enriched?.statistics || {};
      const details = enriched?.contentDetails || {};
      return {
        videoId: id,
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        channelTitle: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt || '',
        thumbnail: item.snippet?.thumbnails?.medium?.url ||
                   item.snippet?.thumbnails?.default?.url || '',
        url: `https://www.youtube.com/watch?v=${id}`,
        viewCount: parseInt(stats.viewCount, 10) || 0,
        likeCount: parseInt(stats.likeCount, 10) || 0,
        duration: details.duration || '',
      };
    });
}

/**
 * Fetch trending videos (most popular). Uses the videos endpoint with
 * chart=mostPopular.
 *
 * @param {string} category - Optional video category ID (e.g. '27' for Education).
 * @param {number} maxResults - Max videos to return (1-50, default 10).
 * @returns {Promise<Array>} Array of video objects.
 */
export async function getTrending(category, maxResults = DEFAULT_MAX_RESULTS) {
  ensureEnabled();

  const n = clampMaxResults(maxResults);
  let url =
    `${YOUTUBE_API_BASE}/videos?part=statistics,snippet,contentDetails` +
    `&chart=mostPopular&maxResults=${n}&key=${config.youtubeApiKey}`;

  if (category && String(category).trim()) {
    url += `&videoCategoryId=${encodeURIComponent(category.trim())}`;
  }

  const res = await fetchWithRetry(url, { label: 'youtube trending' });
  const data = await res.json();

  if (!data.items || !Array.isArray(data.items)) {
    return [];
  }

  return data.items.map((item) => {
    const stats = item.statistics || {};
    const details = item.contentDetails || {};
    return {
      videoId: item.id,
      title: item.snippet?.title || '',
      description: item.snippet?.description || '',
      channelTitle: item.snippet?.channelTitle || '',
      publishedAt: item.snippet?.publishedAt || '',
      thumbnail: item.snippet?.thumbnails?.medium?.url ||
                 item.snippet?.thumbnails?.default?.url || '',
      url: `https://www.youtube.com/watch?v=${item.id}`,
      viewCount: parseInt(stats.viewCount, 10) || 0,
      likeCount: parseInt(stats.likeCount, 10) || 0,
      duration: details.duration || '',
    };
  });
}

function ensureEnabled() {
  if (!config.youtubeEnabled || !config.youtubeApiKey) {
    const err = new ProviderError(
      'YouTube recommendations are not configured. Set YOUTUBE_ENABLED=true and YOUTUBE_API_KEY.'
    );
    err.status = 503;
    err.code = 'FEATURE_DISABLED';
    throw err;
  }
}

// Exposed for tests to override the global fetch if needed.
export { fetchWithRetry as _fetchWithRetry };
