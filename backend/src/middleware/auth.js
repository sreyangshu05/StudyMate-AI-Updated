// Authentication + ownership (IDOR protection) middleware.
//
// Identity is ALWAYS derived from the verified JWT on the request. Never trust
// userId from body, query, or params.

import { verifyToken } from '../services/authService.js';
import { getDatabase } from '../services/database.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from '../errors.js';

function extractToken(req) {
  const header = req.headers.authorization || req.headers['x-access-token'] || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  if (header && !header.startsWith('Bearer ')) {
    return header.trim();
  }
  return null;
}

// Validates the JWT and attaches req.user = { userId, email, isAdmin }.
// If ADMIN_EMAILS is configured, those addresses get elevated privileges.
export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new AuthenticationError('Access token required');

    const payload = await verifyToken(token);
    if (!payload || !payload.userId) {
      throw new AuthenticationError('Invalid or expired token');
    }

    // Load a fresher user record so deleted accounts / admins are correct.
    const db = getDatabase();
    const user = await db.get('SELECT id, email, name FROM users WHERE id = ?', [payload.userId]);
    if (!user) {
      throw new AuthenticationError('Account no longer exists');
    }

    req.user = {
      userId: user.id,
      email: user.email,
      name: user.name,
      isAdmin: false,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

// Convenience wrapper for downstream routes that just want authentication.
export function authenticate(req, res, next) {
  return requireAuth(req, res, next);
}

// Thrown unless the authenticated user is an admin.
export function requireAdmin(req, _res, next) {
  if (!req.user || !req.user.isAdmin) {
    return next(new AuthorizationError('Admin access required'));
  }
  return next();
}

// Owners the authenticated user a row in `table` with `ownerCol = user.id`
// and `idCol = rowId`. Returns the row or throws 403/404.
//
//   try { const doc = await mustOwn('documents', 'user_id', req, 'id'); }
//
// 404 when the row does not exist (even if another user's), so resource
// existence is not leaked; 403 if the authenticated user is not the owner.
export async function mustOwn(table, ownerCol, req, idCol = 'id') {
  const db = getDatabase();
  const row = await db.get(`SELECT * FROM ${table} WHERE ${idCol} = ?`, [req.params.id]);
  if (!row) {
    throw new NotFoundError(`${table.slice(0, -1)} not found`);
  }
  if (row[ownerCol] !== req.user.userId) {
    throw new AuthorizationError();
  }
  return row;
}

// Ownership by explicit resource id from any source (body/query/params).
export async function assertOwnership({ table, ownerCol, userId, resourceId, idCol = 'id', notFoundMessage }) {
  const db = getDatabase();
  const row = await db.get(`SELECT ${idCol}, ${ownerCol} FROM ${table} WHERE ${idCol} = ?`, [resourceId]);
  if (!row) {
    throw new NotFoundError(notFoundMessage || `${table.slice(0, -1)} not found`);
  }
  if (row[ownerCol] !== userId) {
    throw new AuthorizationError();
  }
  return row;
}
