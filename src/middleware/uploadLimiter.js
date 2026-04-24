import rateLimit from 'express-rate-limit';

/**
 * Basic limiter for endpoints that accept file uploads / large payloads.
 * Tuned to prevent accidental/bot abuse without blocking normal admin use.
 */
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many upload requests', code: 'RATE_LIMITED' },
});

