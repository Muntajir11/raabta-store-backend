import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { formatErrorLogPrefix, getClientIp } from '../lib/requestLog.js';
import { makeAuthCookieHelpers } from '../lib/authTokens.js';
import { createLoginThrottle } from '../lib/loginThrottle.js';

const adminCookies = makeAuthCookieHelpers('admin');

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});

const adminLoginThrottle = createLoginThrottle({
  maxFailuresPerIp: 5,
  maxFailuresPerEmail: 3,
  lockMs: 15 * 60 * 1000,
});

function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? 'Validation failed';
}

/**
 * POST /api/admin/auth/login
 */
export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const emailNorm = parsed.data.email.toLowerCase().trim();
    const lock = adminLoginThrottle.check(req, emailNorm);
    if (lock.locked) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.',
        code: 'LOGIN_THROTTLED',
        retryAfterSeconds: Math.ceil(lock.remainingMs / 1000),
      });
    }

    const data = await authService.loginUser(parsed.data);
    if (data.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }

    adminLoginThrottle.onSuccess(req, emailNorm);
    adminCookies.setAuthCookies(req, res, data.accessToken, data.refreshToken);
    req.logMessage = `${data.user.name} logged in as admin`;
    return res.status(200).json({ success: true, data: { user: data.user } });
  } catch (err) {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    if (err?.code === 'INVALID_CREDENTIALS' && email) adminLoginThrottle.onFailure(req, email);
    return next(err);
  }
}

/**
 * POST /api/admin/auth/refresh
 */
export async function refresh(req, res, next) {
  try {
    const refreshToken = adminCookies.readRefreshCookie(req);
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Session expired',
        code: 'SESSION_EXPIRED',
      });
    }

    const data = await authService.refreshSession(refreshToken);
    if (data.user.role !== 'admin') {
      adminCookies.clearAuthCookies(req, res);
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }

    adminCookies.setAuthCookies(req, res, data.accessToken, data.refreshToken);
    req.logMessage = `Admin session refreshed`;
    return res.status(200).json({ success: true, data: { user: data.user } });
  } catch (err) {
    adminCookies.clearAuthCookies(req, res);
    return next(err);
  }
}

/**
 * POST /api/admin/auth/logout
 */
export async function logout(req, res, next) {
  try {
    const refreshToken = adminCookies.readRefreshCookie(req);
    if (refreshToken) {
      await authService.revokeSessionByRefreshToken(refreshToken);
    }
    adminCookies.clearAuthCookies(req, res);
    return res.status(200).json({ success: true });
  } catch (err) {
    adminCookies.clearAuthCookies(req, res);
    return next(err);
  }
}

/**
 * GET /api/admin/auth/session
 */
export async function session(req, res) {
  // Session endpoint must be idempotent (no cookie mutation).
  if (!req.authUser) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  return res.status(200).json({ success: true, data: { user: req.authUser } });
}

