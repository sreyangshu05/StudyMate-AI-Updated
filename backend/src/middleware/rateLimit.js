// Pluggable fixed-window rate limiter.
//
// Default store: in-memory Map (single-instance). For multi-instance
// deployments, set REDIS_URL — a Redis-backed store is loaded on demand (via a
// dynamic import of `ioredis`) so the app still boots without the dependency
// installed. The store contract is intentionally tiny so any external store
// (Redis, Memcached, Postgres) can be dropped in:
//
//   store.get(key)        -> { startedAt, count } | null
//   store.set(key, entry) -> void
//   store.prune(windowMs) -> void   (optional; in-memory prunes opportunistically)
//
// Uses the authenticated userId when available, else a hash of the client IP.

import crypto from 'crypto';
import { RateLimitError } from '../errors.js';

// ---- In-memory store (default, single-instance) ----
class MemoryStore {
  constructor() { this.buckets = new Map(); }
  get(key) { return this.buckets.get(key) || null; }
  set(key, entry) { this.buckets.set(key, entry); }
  prune(windowMs) {
    const now = Date.now();
    for (const [key, entry] of this.buckets) {
      if (now - entry.startedAt > windowMs) this.buckets.delete(key);
    }
  }
}

const memoryStore = new MemoryStore();

// ---- Redis store (multi-instance, loaded on demand when REDIS_URL is set) ----
// Lazily created once per process. `ioredis` is imported dynamically so the app
// has no hard dependency on it and boots normally when Redis isn't configured.
let redisStorePromise = null;
async function getRedisStore(url) {
  if (!redisStorePromise) {
    redisStorePromise = (async () => {
      const Ioredis = (await import('ioredis')).default;
      const client = new Ioredis(url);
      // JSON values; fixed-window counters are small and non-critical.
      return {
        async get(key) {
          const raw = await client.get(`rl:${key}`);
          return raw ? JSON.parse(raw) : null;
        },
        async set(key, entry) {
          // Keep the entry around for the window plus a small safety margin.
          await client.set(`rl:${key}`, JSON.stringify(entry), 'PX', 24 * 60 * 60 * 1000);
        },
        async prune() { /* Redis entries self-expire via TTL; no-op */ },
      };
    })();
  }
  return redisStorePromise;
}

// Resolve the active store. Sync path returns the in-memory store; the Redis
// store is used only when REDIS_URL is set and is awaited lazily inside the
// middleware (the first request pays a one-time connect cost).
function activeStore() {
  if (process.env.REDIS_URL) {
    return { kind: 'redis', store: getRedisStore(process.env.REDIS_URL) };
  }
  return { kind: 'memory', store: memoryStore };
}

export function rateLimit({ windowMs, max, keyPrefix = 'rl' }) {
  return async (req, res, next) => {
    const { kind, store } = activeStore();
    const s = kind === 'redis' ? await store : store;

    if (typeof s.prune === 'function') {
      try { await s.prune(windowMs); } catch { /* best effort */ }
    }

    const identity = req.user
      ? `u:${req.user.userId}`
      : `ip:${crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex').slice(0, 16)}`;
    const key = `${keyPrefix}:${identity}`;

    const now = Date.now();
    let entry = await s.get(key);
    if (!entry || now - entry.startedAt > windowMs) {
      entry = { startedAt: now, count: 1 };
      await s.set(key, entry);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      return next();
    }

    entry.count += 1;
    await s.set(key, entry);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.startedAt + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return next(new RateLimitError());
    }
    return next();
  };
}

// Exported for testing / advanced wiring.
export { MemoryStore };
