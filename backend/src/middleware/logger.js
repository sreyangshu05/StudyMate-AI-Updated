// Request-level structured logging with request IDs.
// NEVER log passwords, tokens, API keys, or full document content.

import crypto from 'crypto';

function redactBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const redacted = {};
  for (const [k, v] of Object.entries(body)) {
    if (/pass(word)?|token|secret|key|authorization|credential/i.test(k)) {
      redacted[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 500) {
      redacted[k] = `[truncated ${v.length} chars]`;
    } else {
      redacted[k] = v;
    }
  }
  return redacted;
}

export function requestLogger(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const line = {
      reqId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userId: req.user ? req.user.userId : undefined,
    };
    if (res.statusCode >= 400 && req.method !== 'GET') {
      line.body = redactBody(req.body);
    }
    if (res.statusCode >= 500) {
      console.error(JSON.stringify(line));
    } else {
      console.log(JSON.stringify(line));
    }
  });
  next();
}
