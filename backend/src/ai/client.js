// OpenAI-compatible client abstraction (works with OpenRouter, OpenAI, or any
// compatible endpoint via AI_BASE_URL). Bounded retries with exponential backoff,
// timeouts, and JSON-safety helpers.

import OpenAI from 'openai';
import config, { reloadAIEnv } from '../config.js';
import { ProviderError } from '../errors.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Client is lazy so the server can boot without an API key (non-AI routes still work).
let cachedClient = null;

export function getAIClient() {
  if (cachedClient) return cachedClient;
  if (!config.openRouterApiKey) {
    throw new ProviderError('No API key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.');
  }
  cachedClient = new OpenAI({
    apiKey: config.openRouterApiKey,
    baseURL: config.aiBaseUrl,
    timeout: config.aiTimeoutMs,
    maxRetries: 0, // we manage retries ourselves
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-Title': 'StudyMate-AI',
    },
  });
  return cachedClient;
}

export function resetAIClientForTests() {
  cachedClient = null;
  // Re-read AI env (base URL, key) into the cached config so a stub provider set
  // via useStubAI() becomes effective without a process restart.
  reloadAIEnv();
}

// Generic retry wrapper with bounded exponential backoff. Retries on
// 429 (rate limit) and 5xx; never retries 4xx except 429.
export async function withRetry(fn, { label = 'ai request', maxRetries } = {}) {
  const attempts = (maxRetries ?? config.aiMaxRetries) + 1;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.statusCode || err?.response?.status;
      const retriable = status === 429 || (status >= 500 && status <= 599) || !status;
      if (attempt === attempts || !retriable) break;
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(`[ai] ${label} attempt ${attempt} failed (${status}); retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  const message = lastErr?.message || 'provider error';
  const status = lastErr?.status || lastErr?.statusCode || lastErr?.response?.status;
  if (status === 429) {
    throw new ProviderError('The AI provider is rate-limiting requests. Try again shortly.');
  }
  throw new ProviderError(`AI provider request failed: ${message}`);
}

// Defensive JSON parsing: strip code fences / surrounding prose, then parse.
export function parseJSONLoose(text) {
  if (typeof text !== 'string') return null;
  let cleaned = text.trim();
  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // If wrapped in backticks
  cleaned = cleaned.replace(/^`+|`+$/g, '');
  // Find the outermost array or object
  const arrayStart = cleaned.indexOf('[');
  const objectStart = cleaned.indexOf('{');
  if (arrayStart === -1 && objectStart === -1) return null;
  let start = arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart) ? arrayStart : objectStart;
  let depth = 0;
  let inString = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const c = cleaned[i];
    if (inString) {
      if (c === '\\') { i += 1; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '[' || c === '{') depth += 1;
    else if (c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (e) {
          break;
        }
      }
    }
  }
  try {
    return JSON.parse(cleaned.slice(start));
  } catch (e) {
    return null;
  }
}
