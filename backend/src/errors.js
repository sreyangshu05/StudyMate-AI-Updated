// Centralized error types and JSON error shape.
// Production error responses must never leak stack traces, secrets, or SQL.

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'AUTHENTICATION_REQUIRED', message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to access this resource') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ForbiddenError extends AuthorizationError {}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message, details) {
    super(409, 'CONFLICT', message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(429, 'RATE_LIMITED', message);
  }
}

export class ProviderError extends AppError {
  constructor(message = 'An upstream provider failed temporarily') {
    super(502, 'PROVIDER_ERROR', message);
  }
}

export class ProcessingError extends AppError {
  constructor(message = 'Processing failed') {
    super(500, 'PROCESSING_ERROR', message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request payload too large') {
    super(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

// Standard response helper: success
export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

// Normalize error object into the canonical { success:false, error:{code,message}} shape.
export function toErrorResponse(err) {
  if (err instanceof AppError) {
    return {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
  }

  if (err && typeof err === 'object' && err.expose === true && err.code) {
    return {
      success: false,
      error: { code: err.code, message: err.message },
    };
  }

  return {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };
}

// Express error-handling middleware.
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // multer body too large
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds the maximum allowed size' },
    });
  }

  const body = toErrorResponse(err);
  const status = err && err.status ? err.status : 500;

  if (status >= 500) {
    // Internal / provider errors: log details server-side only.
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }

  return res.status(status).json(body);
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
