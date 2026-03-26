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
  };
}

function getRefreshExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

async function buildSession(user) {
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
    throw err;
  }

  const match = await bcrypt.compare(input.password, user.passwordHash);
  if (!match) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
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
  } catch {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    err.code = 'INVALID_SESSION';
    throw err;
  }

  if (!payload || typeof payload !== 'object' || payload.typ !== 'refresh') {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    err.code = 'INVALID_SESSION';
    throw err;
  }

  const userId = payload.sub;
  const jti = payload.jti;
  if (typeof userId !== 'string' || typeof jti !== 'string') {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    err.code = 'INVALID_SESSION';
    throw err;
  }

  const user = await User.findById(userId).select(
    '+refreshTokenHash +refreshTokenJti +refreshTokenExpiresAt'
  );
  if (!user || !user.refreshTokenHash || !user.refreshTokenJti || !user.refreshTokenExpiresAt) {
    const err = new Error('Session expired');
    err.statusCode = 401;
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  const expectedHash = hashRefreshToken(refreshToken);
  const isExpired = user.refreshTokenExpiresAt.getTime() < Date.now();
  if (isExpired || user.refreshTokenJti !== jti || user.refreshTokenHash !== expectedHash) {
    user.refreshTokenHash = null;
    user.refreshTokenJti = null;
    user.refreshTokenExpiresAt = null;
    await user.save();

    const err = new Error('Session expired');
    err.statusCode = 401;
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  return buildSession(user);
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
