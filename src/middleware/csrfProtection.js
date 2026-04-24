function normalizeOrigin(value) {
  return value.trim().replace(/\/$/, '').toLowerCase();
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function getTrustedOrigins() {
  const adminOrigin = process.env.ADMIN_ORIGIN;
  const storefrontOrigin = process.env.STOREFRONT_ORIGIN;
  const configured = process.env.CSRF_TRUSTED_ORIGINS;
  const fallback = process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174';
  const sources = [
    ...splitCsv(adminOrigin),
    ...splitCsv(storefrontOrigin),
    ...splitCsv(configured && configured.trim() ? configured : ''),
    ...splitCsv(fallback),
  ];

  return new Set(
    sources
      .map(normalizeOrigin)
      .filter((o) => o && o !== 'null' && !o.includes('*'))
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
    console.warn(
      `[csrf] blocked ${req.method} ${req.originalUrl} | origin=${reqOrigin || 'none'} | trusted=${[
        ...trustedOrigins,
      ].join(',')}`
    );
    return res.status(403).json({
      success: false,
      message: 'CSRF validation failed',
      code: 'CSRF_FORBIDDEN',
    });
  }

  return next();
}
