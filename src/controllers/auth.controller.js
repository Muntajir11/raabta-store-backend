import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import {
  clearAuthCookies,
  readRefreshCookie,
  setAuthCookies,
} from '../lib/authTokens.js';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Invalid email').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});

function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? 'Validation failed';
}

const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_PER_EMAIL = 5;
const LOCK_MS = 15 * 60 * 1000;
const ipFailures = new Map();
const emailFailures = new Map();

function getClientIp(req) {
  const value = req.headers['x-forwarded-for'];
  if (typeof value === 'string' && value.trim()) {
    return value.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function getFailureEntry(store, key) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.lockedUntil < now) {
    const fresh = { count: 0, lockedUntil: 0 };
    store.set(key, fresh);
    return fresh;
  }
  return current;
}

function registerFailedLogin(ip, email) {
  const now = Date.now();

  const ipEntry = getFailureEntry(ipFailures, ip);
  ipEntry.count += 1;
  if (ipEntry.count >= MAX_FAILURES_PER_IP) {
    ipEntry.lockedUntil = now + LOCK_MS;
  }

  const emailEntry = getFailureEntry(emailFailures, email);
  emailEntry.count += 1;
  if (emailEntry.count >= MAX_FAILURES_PER_EMAIL) {
    emailEntry.lockedUntil = now + LOCK_MS;
  }
}

function clearLoginFailures(ip, email) {
  ipFailures.delete(ip);
  emailFailures.delete(email);
}

function getLockInfo(ip, email) {
  const now = Date.now();
  const ipEntry = ipFailures.get(ip);
  const emailEntry = emailFailures.get(email);
  const ipRemaining = ipEntry && ipEntry.lockedUntil > now ? ipEntry.lockedUntil - now : 0;
  const emailRemaining =
    emailEntry && emailEntry.lockedUntil > now ? emailEntry.lockedUntil - now : 0;
  const remainingMs = Math.max(ipRemaining, emailRemaining);
  return { locked: remainingMs > 0, remainingMs };
}

/**
 * POST /api/auth/register
 */
export async function register(req, res, next) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }
    const data = await authService.registerUser(parsed.data);
    setAuthCookies(res, data.accessToken, data.refreshToken);
    return res.status(201).json({ success: true, data: { user: data.user } });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/login
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
    const ip = getClientIp(req);
    const emailNorm = parsed.data.email.toLowerCase().trim();
    const lock = getLockInfo(ip, emailNorm);
    if (lock.locked) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.',
        code: 'LOGIN_THROTTLED',
        retryAfterSeconds: Math.ceil(lock.remainingMs / 1000),
      });
    }

    const data = await authService.loginUser(parsed.data);
    clearLoginFailures(ip, emailNorm);
    setAuthCookies(res, data.accessToken, data.refreshToken);
    return res.status(200).json({ success: true, data: { user: data.user } });
  } catch (err) {
    const ip = getClientIp(req);
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    if (err?.code === 'INVALID_CREDENTIALS' && email) {
      registerFailedLogin(ip, email);
    }
    return next(err);
  }
}

/**
 * POST /api/auth/refresh
 */
export async function refresh(req, res, next) {
  try {
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Session expired',
        code: 'SESSION_EXPIRED',
      });
    }

    const data = await authService.refreshSession(refreshToken);
    setAuthCookies(res, data.accessToken, data.refreshToken);
    return res.status(200).json({ success: true, data: { user: data.user } });
  } catch (err) {
    clearAuthCookies(res);
    return next(err);
  }
}

/**
 * POST /api/auth/logout
 */
export async function logout(req, res, next) {
  try {
    const refreshToken = readRefreshCookie(req);
    if (refreshToken) {
      await authService.revokeSessionByRefreshToken(refreshToken);
    }
    clearAuthCookies(res);
    return res.status(200).json({ success: true });
  } catch (err) {
    clearAuthCookies(res);
    return next(err);
  }
}

/**
 * GET /api/auth/session
 */
export async function session(req, res) {
  if (!req.authUser) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }
  return res.status(200).json({ success: true, data: { user: req.authUser } });
}
