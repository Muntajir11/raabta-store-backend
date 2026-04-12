import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ACCESS_COOKIE = 'raabta_at';
const REFRESH_COOKIE = 'raabta_rt';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getCookieBaseOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

/** Align access + refresh cookie/JWT defaults (override with JWT_*_EXPIRES_IN). */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getAccessMaxAgeMs() {
  return SEVEN_DAYS_MS;
}

function getRefreshMaxAgeMs() {
  return SEVEN_DAYS_MS;
}

export function signAccessToken(user) {
  const secret = requireEnv('JWT_SECRET');
  return jwt.sign({ sub: user.id, email: user.email, typ: 'access' }, secret, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',
  });
}

export function signRefreshToken(user, jti) {
  const secret = requireEnv('JWT_REFRESH_SECRET');
  return jwt.sign({ sub: user.id, typ: 'refresh', jti }, secret, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

export function verifyAccessToken(token) {
  const secret = requireEnv('JWT_SECRET');
  return jwt.verify(token, secret);
}

export function verifyRefreshToken(token) {
  const secret = requireEnv('JWT_REFRESH_SECRET');
  return jwt.verify(token, secret);
}

export function makeRefreshJti() {
  return crypto.randomUUID();
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function setAuthCookies(res, accessToken, refreshToken) {
  const base = getCookieBaseOptions();
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    maxAge: getAccessMaxAgeMs(),
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    maxAge: getRefreshMaxAgeMs(),
  });
}

export function clearAuthCookies(res) {
  const base = getCookieBaseOptions();
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

export function readAccessCookie(req) {
  return req.cookies?.[ACCESS_COOKIE] || null;
}

export function readRefreshCookie(req) {
  return req.cookies?.[REFRESH_COOKIE] || null;
}
