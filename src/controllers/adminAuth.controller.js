import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { formatErrorLogPrefix, getClientIp } from '../lib/requestLog.js';
import { makeAuthCookieHelpers } from '../lib/authTokens.js';

const adminCookies = makeAuthCookieHelpers('admin');

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email').max(254),
  password: z.string().min(1, 'Password is required').max(128),
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

    const data = await authService.loginUser(parsed.data);
    if (data.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }

    adminCookies.setAuthCookies(res, data.accessToken, data.refreshToken);
    req.logMessage = `${data.user.name} logged in as admin`;
    return res.status(200).json({ success: true, data: { user: data.user } });
  } catch (err) {
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
      console.warn(
        `[admin-auth] No refresh cookie — session cannot be renewed | ${formatErrorLogPrefix(req)}`
      );
      return res.status(401).json({
        success: false,
        message: 'Session expired',
        code: 'SESSION_EXPIRED',
      });
    }

    const data = await authService.refreshSession(refreshToken);
    if (data.user.role !== 'admin') {
      adminCookies.clearAuthCookies(res);
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }

    adminCookies.setAuthCookies(res, data.accessToken, data.refreshToken);
    req.logMessage = `Admin session refreshed`;
    return res.status(200).json({ success: true, data: { user: data.user } });
  } catch (err) {
    adminCookies.clearAuthCookies(res);
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
    adminCookies.clearAuthCookies(res);
    return res.status(200).json({ success: true });
  } catch (err) {
    adminCookies.clearAuthCookies(res);
    return next(err);
  }
}

/**
 * GET /api/admin/auth/session
 */
export async function session(req, res) {
  let restored = false;
  if (!req.authUser) {
    try {
      const refreshToken = adminCookies.readRefreshCookie(req);
      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
          code: 'UNAUTHORIZED',
        });
      }
      const data = await authService.refreshSession(refreshToken);
      if (data.user.role !== 'admin') {
        adminCookies.clearAuthCookies(res);
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
          code: 'FORBIDDEN',
        });
      }
      adminCookies.setAuthCookies(res, data.accessToken, data.refreshToken);
      req.authUser = data.user;
      restored = true;
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }
  }

  if (restored) {
    req.logMessage = `Admin session restored`;
  }

  res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  return res.status(200).json({ success: true, data: { user: req.authUser } });
}

