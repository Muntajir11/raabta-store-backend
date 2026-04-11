import { User } from '../models/user.model.js';
import { readAccessCookie, verifyAccessToken } from '../lib/authTokens.js';

/**
 * @type {import('express').RequestHandler}
 */
export async function requireAuth(req, _res, next) {
  try {
    const token = readAccessCookie(req);
    if (!token) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = { reason: 'missing_access_cookie', context: 'requireAuth' };
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
        reason: 'access_jwt_invalid',
        context: 'requireAuth',
        cause: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
      };
      throw err;
    }

    if (!payload || typeof payload !== 'object' || payload.typ !== 'access') {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = { reason: 'not_access_token_payload', context: 'requireAuth' };
      throw err;
    }

    const userId = payload.sub;
    if (typeof userId !== 'string') {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = { reason: 'invalid_token_sub', context: 'requireAuth' };
      throw err;
    }

    const user = await User.findById(userId);
    if (!user) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.details = { reason: 'user_not_found', userId, context: 'requireAuth' };
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
          context: 'requireAuth',
          cause: err instanceof Error ? err.message : String(err),
        };
      }
    }
    next(err);
  }
}
