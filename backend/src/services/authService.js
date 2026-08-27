// Authentication: password hashing, validation, JWT issue/verify, user lookup.
// Security: bcrypt cost 12, strong password rules, no account-enumeration on login.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase } from './database.js';
import config from '../config.js';
import { ValidationError, AuthenticationError, ConflictError } from '../errors.js';

const BCRYPT_ROUNDS = 12;

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email is required';
  const trimmed = email.trim();
  if (trimmed.length > 254) return 'Email is too long';
  // Practical local + domain validation without over-restricting.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return 'Please enter a valid email address';
  return null;
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

export function validateName(name) {
  if (!name || typeof name !== 'string') return 'Name is required';
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 100) return 'Name must be at most 100 characters';
  return null;
}

export async function issueToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: 'studymate' }
  );
}

export async function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { issuer: 'studymate' });
  } catch {
    return null;
  }
}

export async function findUserByEmail(email) {
  const db = getDatabase();
  return db.get('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
}

export async function findUserById(id) {
  const db = getDatabase();
  return db.get('SELECT id, name, email, created_at, updated_at FROM users WHERE id = ?', [id]);
}

export async function register({ name, email, password }) {
  const emailErr = validateEmail(email);
  if (emailErr) throw new ValidationError(emailErr);

  const nameErr = validateName(name);
  if (nameErr) throw new ValidationError(nameErr);

  const pwErr = validatePassword(password);
  if (pwErr) throw new ValidationError(pwErr);

  const db = getDatabase();
  const normalizedEmail = String(email).trim().toLowerCase();

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    // Do not reveal whether an account exists with that email.
    throw new ConflictError('Registration failed. Please try again.');
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await db.run(
    'INSERT INTO users (name, email, hashed_password) VALUES (?, ?, ?)',
    [String(name).trim(), normalizedEmail, hashedPassword]
  );

  const user = { id: result.lastID, name: String(name).trim(), email: normalizedEmail };
  const token = await issueToken(user);
  return { user, token };
}

export async function login({ email, password }) {
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const db = getDatabase();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

  // Uniform error for unknown user vs wrong password (enumeration resistance).
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.hashed_password);
  if (!valid) {
    throw new AuthenticationError('Invalid email or password');
  }

  const token = await issueToken(user);
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email },
  };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const pwErr = validatePassword(newPassword);
  if (pwErr) throw new ValidationError(pwErr);

  const db = getDatabase();
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw new AuthenticationError('User not found');

  const valid = await bcrypt.compare(currentPassword, user.hashed_password);
  if (!valid) throw new AuthenticationError('Current password is incorrect');

  const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.run('UPDATE users SET hashed_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hashed, userId]);
  return { success: true };
}
