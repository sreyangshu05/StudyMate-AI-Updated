// Centralized input validation. Reject malformed requests early with clear errors.

import config from './config.js';
import { ValidationError } from './errors.js';

export function parseId(value, fieldName = 'id') {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer`);
  }
  return n;
}

// Validate and normalize an array of document IDs, optionally scoping to the user.
export function validateDocIds(docIds, { fieldName = 'docIds', required = false } = {}) {
  if (docIds === undefined || docIds === null) {
    if (required) throw new ValidationError(`${fieldName} are required`);
    return [];
  }
  if (!Array.isArray(docIds)) {
    throw new ValidationError(`${fieldName} must be an array of document IDs`);
  }
  if (docIds.length > config.maxSelectedDocs) {
    throw new ValidationError(`Cannot select more than ${config.maxSelectedDocs} documents at once`);
  }
  const unique = [...new Set(docIds)];
  if (unique.length !== docIds.length) {
    throw new ValidationError(`Duplicate ${fieldName} are not allowed`);
  }
  const ids = [];
  for (const d of docIds) {
    const n = Number(d);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ValidationError(`${fieldName} must contain only positive integers`);
    }
    ids.push(n);
  }
  return ids;
}

export function validateTopK(value) {
  if (value === undefined || value === null || value === '') return config.defaultTopK;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError('topK must be a positive integer');
  }
  if (n > config.maxTopK) {
    throw new ValidationError(`topK cannot exceed ${config.maxTopK}`);
  }
  return n;
}

// Validate a non-empty query/message string.
export function validateText(value, fieldName = 'query', { max = 2000, min = 1 } = {}) {
  if (value === undefined || value === null) {
    throw new ValidationError(`${fieldName} is required`);
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ValidationError(`${fieldName} must not be empty`);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${fieldName} must be at most ${max} characters`);
  }
  return trimmed;
}

export function validateQuizConfig({ numQuestions, distribution }) {
  const n = numQuestions === undefined || numQuestions === null ? 10 : Number(numQuestions);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError('numQuestions must be a positive integer');
  }
  if (n > config.maxQuizQuestions) {
    throw new ValidationError(`numQuestions cannot exceed ${config.maxQuizQuestions}`);
  }

  const defaultDist = computeDefaultDistribution(n);
  const dist = distribution && typeof distribution === 'object' ? distribution : defaultDist;

  const mcq = parseQuizCount(dist.mcq);
  const saq = parseQuizCount(dist.saq);
  const laq = parseQuizCount(dist.laq);

  const parts = [mcq, saq, laq].filter((v) => v !== undefined);
  if (parts.length === 0) {
    throw new ValidationError('distribution must include mcq, saq, and/or laq counts');
  }
  for (const v of parts) {
    if (!Number.isInteger(v) || v < 0) {
      throw new ValidationError('distribution counts must be non-negative integers');
    }
  }

  const total = (mcq || 0) + (saq || 0) + (laq || 0);
  if (total !== n) {
    throw new ValidationError(`Distribution counts must sum to ${n} (got ${total})`);
  }
  // A valid quiz needs at least one question of some type.
  if (total === 0) {
    throw new ValidationError('Distribution must include at least one question');
  }

  return { numQuestions: n, distribution: { mcq: mcq || 0, saq: saq || 0, laq: laq || 0 } };
}

function parseQuizCount(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function computeDefaultDistribution(n) {
  const mcq = Math.max(1, Math.round(n * 0.6));
  const saq = Math.max(0, Math.round(n * 0.3));
  const laq = Math.max(0, n - mcq - saq);
  return { mcq, saq, laq };
}

// Answers payload: canonical `{ questionId: answer }` object.
export function validateAnswers(answers) {
  if (Array.isArray(answers)) {
    const result = {};
    for (const item of answers) {
      if (!item || typeof item !== 'object') {
        throw new ValidationError('answers array must contain { questionId, answer } objects');
      }
      const qid = Number(item.questionId);
      if (!Number.isInteger(qid) || qid <= 0) {
        throw new ValidationError(`Invalid question id: ${item.questionId}`);
      }
      if (typeof item.answer !== 'string' || item.answer.trim().length === 0) {
        throw new ValidationError(`Answer for question ${qid} must be a non-empty string`);
      }
      result[qid] = item.answer;
    }
    if (Object.keys(result).length === 0) {
      throw new ValidationError('answers must include at least one question');
    }
    return result;
  }

  if (!answers || typeof answers !== 'object') {
    throw new ValidationError('answers must be an object mapping questionId to answer');
  }
  const keys = Object.keys(answers);
  if (keys.length === 0) {
    throw new ValidationError('answers must include at least one question');
  }
  if (keys.length > 500) {
    throw new ValidationError('Too many answers submitted');
  }
  const result = {};
  for (const k of keys) {
    const qid = Number(k);
    if (!Number.isInteger(qid) || qid <= 0) {
      throw new ValidationError(`Invalid question id: ${k}`);
    }
    const val = answers[k];
    if (typeof val !== 'string' || val.trim().length === 0) {
      throw new ValidationError(`Answer for question ${qid} must be a non-empty string`);
    }
    result[qid] = val;
  }
  return result;
}

export function validateEmailFormat(email) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
    throw new ValidationError('Please enter a valid email address');
  }
  return email.trim().toLowerCase();
}
