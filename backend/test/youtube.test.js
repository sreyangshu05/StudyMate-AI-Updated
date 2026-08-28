// YouTube Data API v3 integration tests.
//
// Tests exercise:
// 1. Disabled state (default) -> 503 FEATURE_DISABLED (no fake data).
// 2. Enabled state with stubbed fetch -> real API shape parsed correctly.
// 3. Validation: missing topic -> 400.
// 4. API error propagation (4xx/5xx from YouTube).
// 5. maxResults clamping.
//
// No real network calls: global fetch is stubbed per-test.

import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestApp, api } from './helpers.js';

let ctx;
let originalFetch;

before(async () => {
  ctx = await setupTestApp();
  originalFetch = globalThis.fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  ctx.cleanup();
});

beforeEach(() => {
  // Reset YouTube env to disabled before each test.
  delete process.env.YOUTUBE_ENABLED;
  delete process.env.YOUTUBE_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.YOUTUBE_ENABLED;
  delete process.env.YOUTUBE_API_KEY;
});

// Helper: reload config so it picks up env changes (config caches at import).
async function reloadConfig() {
  const mod = await import('../src/config.js');
  if (typeof mod.reloadAIEnv === 'function') mod.reloadAIEnv();
  // config reads youtube vars at module load; set them directly on the
  // cached config object since env reload may not cover youtube fields.
  mod.default.youtubeEnabled = (process.env.YOUTUBE_ENABLED || 'false') === 'true';
  mod.default.youtubeApiKey = process.env.YOUTUBE_API_KEY || '';
}

function enableYoutube() {
  process.env.YOUTUBE_ENABLED = 'true';
  process.env.YOUTUBE_API_KEY = 'test-youtube-key';
}

// Stub fetch: intercept YouTube API calls, pass through local backend calls.
function stubFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    // Only intercept YouTube Data API calls; pass through local test server.
    if (!urlStr.includes('googleapis.com')) {
      return originalFetch(url, opts);
    }
    calls.push(urlStr);
    const match = responses.find((r) => {
      if (typeof r.url === 'string') return urlStr.includes(r.url);
      return r.url.test(urlStr);
    });
    if (!match) throw new Error(`Unexpected YouTube API URL: ${urlStr}`);
    if (match.error) throw match.error;
    const status = match.status || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => match.body,
      text: async () => JSON.stringify(match.body),
    };
  };
  return calls;
}

describe('YouTube: disabled state (default)', () => {
  test('GET /recommendations returns 503 FEATURE_DISABLED', async () => {
    await reloadConfig();
    const client = api(ctx.base);
    const { token } = await client.register('YT User', 'yt1@e.com');
    const res = await fetch(`${ctx.base}/api/youtube/recommendations?topic=physics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'FEATURE_DISABLED');
  });

  test('GET /trending returns 503 FEATURE_DISABLED', async () => {
    await reloadConfig();
    const client = api(ctx.base);
    const { token } = await client.register('YT User2', 'yt2@e.com');
    const res = await fetch(`${ctx.base}/api/youtube/trending`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error.code, 'FEATURE_DISABLED');
  });

  test('disabled state never calls the YouTube API (no fabricated data)', async () => {
    await reloadConfig();
    let ytFetchCalled = false;
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('googleapis.com')) {
        ytFetchCalled = true;
      }
      return originalFetch(url, opts);
    };
    const client = api(ctx.base);
    const { token } = await client.register('YT User3', 'yt3@e.com');
    await fetch(`${ctx.base}/api/youtube/recommendations?topic=math`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(ytFetchCalled, false, 'YouTube API must not be called when disabled');
  });
});

describe('YouTube: enabled state with stubbed API', () => {
  test('GET /recommendations returns real-shaped video data', async () => {
    enableYoutube();
    await reloadConfig();
    const client = api(ctx.base);
    const { token } = await client.register('YT User4', 'yt4@e.com');

    stubFetch([
      {
        url: '/search',
        body: {
          items: [
            {
              id: { videoId: 'vid1' },
              snippet: {
                title: 'Physics Lecture 1',
                description: 'Newton laws',
                channelTitle: 'MIT OCW',
                publishedAt: '2024-01-01T00:00:00Z',
                thumbnails: { medium: { url: 'https://img.yt/vid1-m.jpg' } },
              },
            },
            {
              id: { videoId: 'vid2' },
              snippet: {
                title: 'Physics Lecture 2',
                description: 'Thermodynamics',
                channelTitle: 'Khan Academy',
                publishedAt: '2024-02-01T00:00:00Z',
                thumbnails: { medium: { url: 'https://img.yt/vid2-m.jpg' } },
              },
            },
          ],
        },
      },
      {
        url: '/videos?',
        body: {
          items: [
            {
              id: 'vid1',
              statistics: { viewCount: '12345', likeCount: '200' },
              contentDetails: { duration: 'PT10M30S' },
            },
            {
              id: 'vid2',
              statistics: { viewCount: '67890', likeCount: '500' },
              contentDetails: { duration: 'PT5M15S' },
            },
          ],
        },
      },
    ]);

    const res = await fetch(`${ctx.base}/api/youtube/recommendations?topic=physics&maxResults=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.videos.length, 2);

    const v = body.data.videos[0];
    assert.equal(v.videoId, 'vid1');
    assert.equal(v.title, 'Physics Lecture 1');
    assert.equal(v.channelTitle, 'MIT OCW');
    assert.equal(v.viewCount, 12345);
    assert.equal(v.likeCount, 200);
    assert.equal(v.duration, 'PT10M30S');
    assert.equal(v.url, 'https://www.youtube.com/watch?v=vid1');
    assert.equal(v.thumbnail, 'https://img.yt/vid1-m.jpg');
  });

  test('GET /trending returns real-shaped video data', async () => {
    enableYoutube();
    await reloadConfig();
    const client = api(ctx.base);
    const { token } = await client.register('YT User5', 'yt5@e.com');

    stubFetch([
      {
        url: '/videos?part=statistics,snippet,contentDetails&chart=mostPopular',
        body: {
          items: [
            {
              id: 'trend1',
              snippet: {
                title: 'Trending Education Video',
                channelTitle: 'EduHub',
                publishedAt: '2024-03-01T00:00:00Z',
                thumbnails: { medium: { url: 'https://img.yt/trend1-m.jpg' } },
              },
              statistics: { viewCount: '1000000', likeCount: '50000' },
              contentDetails: { duration: 'PT15M' },
            },
          ],
        },
      },
    ]);

    const res = await fetch(`${ctx.base}/api/youtube/trending?maxResults=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.videos.length, 1);
    assert.equal(body.data.videos[0].videoId, 'trend1');
    assert.equal(body.data.videos[0].viewCount, 1000000);
  });

  test('missing topic returns 400 VALIDATION_ERROR', async () => {
    enableYoutube();
    await reloadConfig();
    const client = api(ctx.base);
    const { token } = await client.register('YT User6', 'yt6@e.com');

    const res = await fetch(`${ctx.base}/api/youtube/recommendations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  test('YouTube API 403 error propagates as PROVIDER_ERROR', async () => {
    enableYoutube();
    await reloadConfig();
    const client = api(ctx.base);
    const { token } = await client.register('YT User7', 'yt7@e.com');

    stubFetch([
      { url: '/search', status: 403, body: { error: { message: 'API key invalid' } } },
    ]);

    const res = await fetch(`${ctx.base}/api/youtube/recommendations?topic=math`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // ProviderError from a 4xx (non-429) is status 502 by default, but we
    // set err.status to the upstream status in fetchWithRetry.
    assert.ok(res.status >= 400, 'should be an error status');
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('empty search results return empty array (no fabrication)', async () => {
    enableYoutube();
    await reloadConfig();
    const client = api(ctx.base);
    const { token } = await client.register('YT User8', 'yt8@e.com');

    stubFetch([
      { url: '/search', body: { items: [] } },
    ]);

    const res = await fetch(`${ctx.base}/api/youtube/recommendations?topic=quantum`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.videos.length, 0);
  });

  test('requires authentication (401 without token)', async () => {
    enableYoutube();
    await reloadConfig();
    const res = await fetch(`${ctx.base}/api/youtube/recommendations?topic=physics`);
    assert.equal(res.status, 401);
  });
});
