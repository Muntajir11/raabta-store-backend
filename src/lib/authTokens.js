import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ACCESS_COOKIE = 'raabta_at';
const REFRESH_COOKIE = 'raabta_rt';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isRequestSecure(req) {
  if (!req) return null;
  if (req.secure === true) return true;
  const xfProto = req.get?.('x-forwarded-proto');
  if (typeof xfProto === 'string' && xfProto.toLowerCase().includes('https')) return true;
  return false;
}

function getCookieBaseOptions(req) {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSiteRaw = String(process.env.COOKIE_SAMESITE || (isProduction ? 'lax' : 'lax'))
    .trim()
    .toLowerCase();
  const sameSite =
    sameSiteRaw === 'none' || sameSiteRaw === 'lax' || sameSiteRaw === 'strict'
      ? sameSiteRaw
      : 'lax';
  const secureRaw = String(process.env.COOKIE_SECURE || (isProduction ? 'true' : 'false'))
    .trim()
    .toLowerCase();
  const secure =
    secureRaw === 'auto'
      ? (isRequestSecure(req) ?? (isProduction ? true : false))
      : secureRaw === 'true';
  if (sameSite === 'none' && !secure) {
    throw new Error('COOKIE_SECURE must be true when COOKIE_SAMESITE=none');
  }
  return {
    httpOnly: true,
    secure,
    sameSite,
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

function buildCookieNames(prefix) {
  const p = (prefix || '').trim();
  const base = p ? `raabta_${p}` : 'raabta';
  return {
    access: `${base}_at`,
    refresh: `${base}_rt`,
  };
}

export function makeAuthCookieHelpers(prefix = '') {
  const names = buildCookieNames(prefix);
  return {
    accessCookieName: names.access,
    refreshCookieName: names.refresh,
    setAuthCookies(req, res, accessToken, refreshToken) {
      const base = getCookieBaseOptions(req);
      res.cookie(names.access, accessToken, {
        ...base,
        maxAge: getAccessMaxAgeMs(),
      });
      res.cookie(names.refresh, refreshToken, {
        ...base,
        maxAge: getRefreshMaxAgeMs(),
      });
    },
    clearAuthCookies(req, res) {
      const base = getCookieBaseOptions(req);
      res.clearCookie(names.access, base);
      res.clearCookie(names.refresh, base);
    },
    readAccessCookie(req) {
      return req.cookies?.[names.access] || null;
    },
    readRefreshCookie(req) {
      return req.cookies?.[names.refresh] || null;
    },
  };
}

export function setAuthCookies(req, res, accessToken, refreshToken) {
  const base = getCookieBaseOptions(req);
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    maxAge: getAccessMaxAgeMs(),
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    maxAge: getRefreshMaxAgeMs(),
  });
}

export function clearAuthCookies(req, res) {
  const base = getCookieBaseOptions(req);
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

export function readAccessCookie(req) {
  return req.cookies?.[ACCESS_COOKIE] || null;
}

export function readRefreshCookie(req) {
  return req.cookies?.[REFRESH_COOKIE] || null;
}
