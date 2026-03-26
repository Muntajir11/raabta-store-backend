function normalizeOrigin(value) {
  return value.trim().replace(/\/$/, '').toLowerCase();
}

function getTrustedOrigins() {
  const configured = process.env.CSRF_TRUSTED_ORIGINS;
  const fallback = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const raw = configured && configured.trim() ? configured : fallback;

  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map(normalizeOrigin)
  );
}

function getRequestOrigin(req) {
  const origin = req.get('origin');
  if (origin) return normalizeOrigin(origin);

  const referer = req.get('referer');
  if (!referer) return null;
  try {
    const parsed = new URL(referer);
    return normalizeOrigin(parsed.origin);
  } catch {
    return null;
  }
}

/**
 * Origin/Referer validation CSRF defense for cookie-auth mutation endpoints.
 * @type {import('express').RequestHandler}
 */
export function csrfProtection(req, res, next) {
  const trustedOrigins = getTrustedOrigins();
  const reqOrigin = getRequestOrigin(req);

  if (!reqOrigin || !trustedOrigins.has(reqOrigin)) {
    return res.status(403).json({
      success: false,
      message: 'CSRF validation failed',
      code: 'CSRF_FORBIDDEN',
    });
  }

  return next();
}
