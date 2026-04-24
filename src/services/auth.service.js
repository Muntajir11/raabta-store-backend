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
const REFRESH_GRACE_MS = 30 * 1000;

function toPublicUser(doc) {
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email,
    role: doc.role || 'user',
    gender: doc.gender || '',
    avatarSeed: doc.avatarSeed || '',
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
  user.prevRefreshTokenHash = null;
  user.prevRefreshTokenJti = null;
  user.prevRefreshTokenValidUntil = null;
  await user.save();
  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
  };
}

/**
 * @param {{ name: string; email: string; password: string; gender: 'male'|'female' }} input
 */
export async function registerUser(input) {
  const emailNorm = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email: emailNorm });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    err.code = 'EMAIL_EXISTS';
    err.details = { emailHash: hashRefreshToken(emailNorm).slice(0, 8), context: 'registerUser' };
    throw err;
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const gender = input.gender === 'female' ? 'female' : 'male';
  const avatarSeed = `${gender}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  const user = await User.create({
    name: input.name.trim(),
    email: emailNorm,
    passwordHash,
    gender,
    avatarSeed,
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
    err.details = { reason: 'no_user_for_email', emailHash: hashRefreshToken(emailNorm).slice(0, 8), context: 'loginUser' };
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

  const user = await User.findById(userId).select(
    '+refreshTokenHash +refreshTokenJti +refreshTokenExpiresAt +prevRefreshTokenHash +prevRefreshTokenJti +prevRefreshTokenValidUntil'
  );
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

  const now = Date.now();
  const tokenHash = hashRefreshToken(refreshToken);
  const tokenJti = typeof payload.jti === 'string' ? payload.jti : null;
  const currentOk =
    !!tokenJti &&
    user.refreshTokenHash &&
    user.refreshTokenJti &&
    user.refreshTokenExpiresAt &&
    user.refreshTokenExpiresAt.getTime() > now &&
    user.refreshTokenHash === tokenHash &&
    user.refreshTokenJti === tokenJti;

  const prevOk =
    !!tokenJti &&
    user.prevRefreshTokenHash &&
    user.prevRefreshTokenJti &&
    user.prevRefreshTokenValidUntil &&
    user.prevRefreshTokenValidUntil.getTime() > now &&
    user.prevRefreshTokenHash === tokenHash &&
    user.prevRefreshTokenJti === tokenJti;

  if (!currentOk && !prevOk) {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    err.code = 'INVALID_SESSION';
    err.details = { reason: 'refresh_token_mismatch', context: 'refreshSession' };
    throw err;
  }

  // Rotate refresh token on every refresh, but keep the previous token valid briefly to
  // avoid concurrent refresh calls kicking users out.
  const nextRefreshJti = makeRefreshJti();
  const nextRefreshToken = signRefreshToken(user, nextRefreshJti);
  const nextRefreshTokenHash = hashRefreshToken(nextRefreshToken);

  user.prevRefreshTokenHash = user.refreshTokenHash;
  user.prevRefreshTokenJti = user.refreshTokenJti;
  user.prevRefreshTokenValidUntil = new Date(now + REFRESH_GRACE_MS);
  user.refreshTokenHash = nextRefreshTokenHash;
  user.refreshTokenJti = nextRefreshJti;
  user.refreshTokenExpiresAt = getRefreshExpiryDate();
  await user.save();

  const accessToken = signAccessToken(user);
  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken: nextRefreshToken,
  };
}

/**
 * @param {string} userId
 */
export async function revokeSessionForUser(userId) {
  const user = await User.findById(userId).select(
    '+refreshTokenHash +refreshTokenJti +refreshTokenExpiresAt +prevRefreshTokenHash +prevRefreshTokenJti +prevRefreshTokenValidUntil'
  );
  if (!user) return;
  user.refreshTokenHash = null;
  user.refreshTokenJti = null;
  user.refreshTokenExpiresAt = null;
  user.prevRefreshTokenHash = null;
  user.prevRefreshTokenJti = null;
  user.prevRefreshTokenValidUntil = null;
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
