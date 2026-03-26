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
      throw err;
    }

    const payload = verifyAccessToken(token);
    if (!payload || typeof payload !== 'object' || payload.typ !== 'access') {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const userId = payload.sub;
    if (typeof userId !== 'string') {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const user = await User.findById(userId);
    if (!user) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    req.authUser = { id: user.id, name: user.name, email: user.email };
    next();
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.message = 'Unauthorized';
    }
    next(err);
  }
}
