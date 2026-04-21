/**
 * Client IP for logging (honors X-Forwarded-For when present).
 * @param {import('express').Request} req
 */
export function getClientIp(req) {
  const value = req.headers['x-forwarded-for'];
  if (typeof value === 'string' && value.trim()) {
    return value.split(',')[0].trim();
  }
  if (typeof req.socket?.remoteAddress === 'string') {
    return req.socket.remoteAddress;
  }
  return req.ip || 'unknown';
}

/**
 * Current time in Asia/Kolkata, 12-hour clock with AM/PM.
 * @param {Date} [date]
 */
export function formatIst12h(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Path without query string.
 * @param {import('express').Request} req
 */
function pathOnly(req) {
  return (req.originalUrl || req.url || '').split('?')[0];
}

/**
 * Actor label for logs (no email).
 * @param {import('express').Request} req
 */
function actor(req) {
  const u = req.authUser;
  if (u && u.name) {
    const id = u.id ? String(u.id).trim() : '';
    return id ? `${u.name} (#${id})` : u.name;
  }
  return 'a user';
}

/**
 * Human-readable description for completed HTTP responses.
 * @param {import('express').Request} req
 * @param {number} statusCode
 */
export function describeHttpFinish(req, statusCode) {
  if (typeof req.logMessage === 'string' && req.logMessage.trim()) {
    return req.logMessage.trim();
  }

  const method = req.method || '—';
  const path = pathOnly(req);
  const u = req.authUser;

  // Suppress noisy, expected unauthenticated requests (especially after logout).
  if (statusCode === 401) {
    if (method === 'GET' && (path === '/api/auth/session' || path === '/api/admin/auth/session')) {
      return null;
    }
    if (method === 'POST' && (path === '/api/auth/refresh' || path === '/api/admin/auth/refresh')) {
      return null;
    }
    if (method === 'GET' && (path === '/api/wishlist' || path === '/api/cart')) {
      return null;
    }
  }

  if (path === '/api/auth/login' && method === 'POST') {
    if (statusCode === 200) {
      return 'Login succeeded';
    }
    if (statusCode === 429) return 'Login blocked: too many failed attempts from this IP/email';
    if (statusCode === 400) return 'Login failed: invalid request body';
    return 'Login failed (wrong credentials or error)';
  }

  if (path === '/api/auth/register' && method === 'POST') {
    if (statusCode === 201) {
      return 'New account registered';
    }
    return 'Registration failed or rejected';
  }

  if (path === '/api/auth/refresh' && method === 'POST') {
    if (statusCode === 200) return `${actor(req)} refreshed session`;
    return 'Session refresh failed';
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    return `${actor(req)} logged out`;
  }

  if (path === '/api/auth/session' && method === 'GET') {
    // Keep session checks quiet; only log when controller sets an explicit message
    // (e.g. a real refresh/restore happened).
    if (typeof req.logMessage === 'string' && req.logMessage.trim()) {
      return req.logMessage.trim();
    }
    return null;
  }

  if (path === '/api/admin/auth/session' && method === 'GET') {
    if (typeof req.logMessage === 'string' && req.logMessage.trim()) {
      return req.logMessage.trim();
    }
    return null;
  }

  if (path.startsWith('/api/admin')) {
    const who = u ? actor(req) : 'unauthenticated caller';
    if (statusCode === 403) {
      return `Admin route denied — ${who} is not an admin (${method} ${path})`;
    }
    if (statusCode === 401) {
      return `Admin route — not signed in (${method} ${path})`;
    }

    if (path.startsWith('/api/admin/customers')) {
      if (statusCode < 400 && u?.role === 'admin') {
        if (method === 'GET' && path === '/api/admin/customers') {
          return `${actor(req)} viewed customers list`;
        }
        const userId = req.params?.userId;
        if (method === 'GET' && userId) {
          return `${actor(req)} viewed customer ${userId}`;
        }
        return `${actor(req)} used customers admin API (${method} ${path})`;
      }
    }

    if (path.startsWith('/api/admin/products')) {
      if (statusCode < 400 && u?.role === 'admin') {
        const productId = req.params?.productId;
        if (method === 'GET' && path === '/api/admin/products') {
          const section = typeof req.query?.section === 'string' ? req.query.section.trim() : '';
          const q = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
          const filters = [section ? `section=${section}` : '', q ? `q=${q}` : ''].filter(Boolean).join(' ');
          return filters ? `${actor(req)} viewed products list (${filters})` : `${actor(req)} viewed products list`;
        }
        if (method === 'POST' && path === '/api/admin/products') {
          return `${actor(req)} created product`;
        }
        if (method === 'PATCH' && productId && path === `/api/admin/products/${productId}`) {
          return `${actor(req)} updated product ${productId}`;
        }
        if (method === 'PATCH' && productId && path === `/api/admin/products/${productId}/toggle-active`) {
          return `${actor(req)} toggled product ${productId} visibility`;
        }
        if (method === 'DELETE' && productId && path === `/api/admin/products/${productId}`) {
          return `${actor(req)} deleted product ${productId}`;
        }
        return `${actor(req)} used products admin API (${method} ${path})`;
      }
    }

    return `Admin API ${method} ${path} → HTTP ${statusCode}`;
  }

  if (path.startsWith('/api/cart')) {
    if (method === 'GET' && path === '/api/cart') {
      return `${actor(req)} viewed cart`;
    }
    if (method === 'POST' && path === '/api/cart/items') {
      const b = req.body || {};
      return `${actor(req)} added to cart: product=${b.productId} size=${b.size} color=${b.color} gsm=${b.gsm} qty=${b.qty}`;
    }
    if (method === 'PATCH' && path === '/api/cart/items') {
      const b = req.body || {};
      return `${actor(req)} updated cart qty: product=${b.productId} size=${b.size} color=${b.color} gsm=${b.gsm} qty=${b.qty}`;
    }
    if (method === 'DELETE' && path === '/api/cart/items') {
      const b = req.body || {};
      return `${actor(req)} removed from cart: product=${b.productId} size=${b.size} color=${b.color} gsm=${b.gsm}`;
    }
    if (method === 'DELETE' && path === '/api/cart') {
      return `${actor(req)} cleared cart`;
    }
    if (method === 'POST' && path === '/api/cart/merge') {
      const n = Array.isArray(req.body?.items) ? req.body.items.length : 0;
      return `${actor(req)} merged guest cart: items=${n}`;
    }
    return `${actor(req)} used cart API (${method} ${path})`;
  }

  if (path.startsWith('/api/products')) {
    if (method === 'GET' && path === '/api/products') {
      return `${actor(req)} viewed products`;
    }
    return `Storefront products ${method} ${path} → HTTP ${statusCode}`;
  }

  return `${method} ${path} → HTTP ${statusCode}`;
}

/**
 * One line for access logs: IST time, IP, message, route, status, latency.
 * @param {import('express').Request} req
 * @param {number} statusCode
 * @param {number} ms
 */
export function formatHttpAccessLine(req, statusCode, ms) {
  const ts = formatIst12h();
  const ip = getClientIp(req);
  const msg = describeHttpFinish(req, statusCode);
  if (!msg) return null;
  const route = `${req.method || '—'} ${req.originalUrl || req.url || '—'}`;
  return `[http] ${ts} IST | ip=${ip} | ${msg} | ${route} → ${statusCode} (${ms}ms)`;
}

/**
 * Error log prefix line (same time/IP style as HTTP access).
 * @param {import('express').Request} req
 */
export function formatErrorLogPrefix(req) {
  const ts = formatIst12h();
  const ip = getClientIp(req);
  const route = `${req.method || '—'} ${req.originalUrl || req.url || '—'}`;
  return `${ts} IST | ip=${ip} | ${route}`;
}
