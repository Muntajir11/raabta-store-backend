import { User } from '../models/user.model.js';
import { makeAuthCookieHelpers, verifyAccessToken } from '../lib/authTokens.js';

const adminCookies = makeAuthCookieHelpers('admin');

/**
 * @type {import('express').RequestHandler}
 */
export async function requireAdminAuth(req, _res, next) {
  try {
    const token = adminCookies.readAccessCookie(req);
    if (!token) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = { reason: 'missing_admin_access_cookie', context: 'requireAdminAuth' };
      throw err;
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (verifyErr) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = {
        reason: 'admin_access_jwt_invalid',
        context: 'requireAdminAuth',
        cause: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
      };
      throw err;
    }

    if (!payload || typeof payload !== 'object' || payload.typ !== 'access') {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = { reason: 'not_access_token_payload', context: 'requireAdminAuth' };
      throw err;
    }

    const userId = payload.sub;
    if (typeof userId !== 'string') {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = { reason: 'invalid_token_sub', context: 'requireAdminAuth' };
      throw err;
    }

    const user = await User.findById(userId);
    if (!user) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = { reason: 'user_not_found', userId, context: 'requireAdminAuth' };
      throw err;
    }

    req.authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'user',
    };
    next();
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.message = 'Unauthorized';
      if (!err.details) {
        err.details = {
          reason: 'unexpected',
          context: 'requireAdminAuth',
          cause: err instanceof Error ? err.message : String(err),
        };
      }
    }
    next(err);
  }
}

