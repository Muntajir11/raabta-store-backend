import bcrypt from 'bcryptjs';
import { User } from '../models/user.model.js';
import {
  hashRefreshToken,
  makeRefreshJti,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/authTokens.js';

const SALT_ROUNDS = 12;

function toPublicUser(doc) {
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email,
    role: doc.role || 'user',
  };
}

function getRefreshExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

export async function buildSession(user) {
  const refreshJti = makeRefreshJti();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, refreshJti);
  user.refreshTokenHash = hashRefreshToken(refreshToken);
  user.refreshTokenJti = refreshJti;
  user.refreshTokenExpiresAt = getRefreshExpiryDate();
  await user.save();
  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
  };
}

/**
 * @param {{ name: string; email: string; password: string }} input
 */
export async function registerUser(input) {
  const emailNorm = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email: emailNorm });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    err.code = 'EMAIL_EXISTS';
    err.details = { email: emailNorm, context: 'registerUser' };
    throw err;
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await User.create({
    name: input.name.trim(),
    email: emailNorm,
    passwordHash,
  });

  return buildSession(user);
}

/**
 * @param {{ email: string; password: string }} input
 */
export async function loginUser(input) {
  const emailNorm = input.email.toLowerCase().trim();
  const user = await User.findOne({ email: emailNorm }).select(
    '+passwordHash +refreshTokenHash +refreshTokenJti +refreshTokenExpiresAt'
  );
  if (!user) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    err.details = { reason: 'no_user_for_email', email: emailNorm, context: 'loginUser' };
    throw err;
  }

  const match = await bcrypt.compare(input.password, user.passwordHash);
  if (!match) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    err.details = { reason: 'password_mismatch', userId: user.id, context: 'loginUser' };
    throw err;
  }

  return buildSession(user);
}

/**
 * @param {string} refreshToken
 */
export async function refreshSession(refreshToken) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (verifyErr) {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    err.code = 'INVALID_SESSION';
    err.details = {
      reason: 'refresh_jwt_verify_failed',
      context: 'refreshSession',
      cause: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
    };
    throw err;
  }

  if (!payload || typeof payload !== 'object' || payload.typ !== 'refresh') {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    err.code = 'INVALID_SESSION';
    err.details = { reason: 'not_refresh_token_payload', context: 'refreshSession' };
    throw err;
  }

  const userId = payload.sub;
  if (typeof userId !== 'string') {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    err.code = 'INVALID_SESSION';
    err.details = { reason: 'missing_sub', context: 'refreshSession' };
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Session expired');
    err.statusCode = 401;
    err.code = 'SESSION_EXPIRED';
    err.details = {
      reason: 'user_not_found',
      userId,
      context: 'refreshSession',
    };
    throw err;
  }

  // Important: do NOT rotate refresh tokens on every refresh.
  // Rotation + concurrent refresh calls can revoke the session and clear cookies.
  const accessToken = signAccessToken(user);
  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
  };
}

/**
 * @param {string} userId
 */
export async function revokeSessionForUser(userId) {
  const user = await User.findById(userId).select(
    '+refreshTokenHash +refreshTokenJti +refreshTokenExpiresAt'
  );
  if (!user) return;
  user.refreshTokenHash = null;
  user.refreshTokenJti = null;
  user.refreshTokenExpiresAt = null;
  await user.save();
}

/**
 * @param {string} refreshToken
 */
export async function revokeSessionByRefreshToken(refreshToken) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return;
  }
  if (!payload || typeof payload !== 'object' || payload.typ !== 'refresh') return;
  const userId = payload.sub;
  if (typeof userId !== 'string') return;
  await revokeSessionForUser(userId);
}

/**
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export async function updatePasswordAndRotateSession(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select(
    '+passwordHash +refreshTokenHash +refreshTokenJti +refreshTokenExpiresAt'
  );
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.details = { reason: 'user_not_found', context: 'updatePasswordAndRotateSession' };
    throw err;
  }

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    err.details = { reason: 'password_mismatch', userId, context: 'updatePasswordAndRotateSession' };
    throw err;
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  return buildSession(user);
}
