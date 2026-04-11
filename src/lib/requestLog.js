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
  const emailGuess =
    typeof req.body?.email === 'string' ? req.body.email.trim() : '';

  if (path === '/api/auth/login' && method === 'POST') {
    if (statusCode === 200) {
      return emailGuess
        ? `Login succeeded for ${emailGuess}`
        : 'Login succeeded';
    }
    if (statusCode === 429) return 'Login blocked: too many failed attempts from this IP/email';
    if (statusCode === 400) return 'Login failed: invalid request body';
    return emailGuess
      ? `Login failed for ${emailGuess} (wrong credentials or error)`
      : 'Login failed';
  }

  if (path === '/api/auth/register' && method === 'POST') {
    if (statusCode === 201) {
      return emailGuess
        ? `New account registered: ${emailGuess}`
        : 'New account registered';
    }
    return 'Registration failed or rejected';
  }

  if (path === '/api/auth/refresh' && method === 'POST') {
    if (statusCode === 200) return 'Auth session refreshed (new tokens issued)';
    return 'Session refresh failed';
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    return 'User logged out (cookies cleared)';
  }

  if (path === '/api/auth/session' && method === 'GET') {
    // Express may respond with 304 Not Modified when ETag matches (same as 200 for logging).
    const sessionOk =
      u && (statusCode === 200 || statusCode === 304);
    if (sessionOk) {
      const role = u.role === 'admin' ? 'admin' : 'user';
      return `Session verified: ${u.name} (${u.email}) as ${role}`;
    }
    if (statusCode === 401 || !u) {
      return 'Session check: not authenticated';
    }
    return `Session check: HTTP ${statusCode}`;
  }

  if (path.startsWith('/api/admin')) {
    const who = u ? `${u.name} <${u.email}>` : 'unauthenticated caller';
    if (statusCode === 403) {
      return `Admin route denied — ${who} is not an admin (${method} ${path})`;
    }
    if (statusCode === 401) {
      return `Admin route — not signed in (${method} ${path})`;
    }
    if (path.startsWith('/api/admin/customers')) {
      if (statusCode < 400 && u?.role === 'admin') {
        return `Admin ${u.email} accessed customer data (${method} ${path})`;
      }
    }
    if (path.startsWith('/api/admin/products')) {
      if (statusCode < 400 && u?.role === 'admin') {
        return `Admin ${u.email} used products admin API (${method} ${path})`;
      }
    }
    return `Admin API ${method} ${path} → HTTP ${statusCode}`;
  }

  if (path.startsWith('/api/cart')) {
    return `Cart ${method} ${path} → HTTP ${statusCode}`;
  }

  if (path.startsWith('/api/products')) {
    return `Storefront products ${method} ${path} → HTTP ${statusCode}`;
  }

  return `${method} ${path} → HTTP ${statusCode}`;
}

/**
 * One line for access logs: IST time, IP, request id, message, route, status, latency.
 * @param {import('express').Request} req
 * @param {number} statusCode
 * @param {number} ms
 */
export function formatHttpAccessLine(req, statusCode, ms) {
  const ts = formatIst12h();
  const ip = getClientIp(req);
  const rid = req.requestId || '—';
  const msg = describeHttpFinish(req, statusCode);
  const route = `${req.method || '—'} ${req.originalUrl || req.url || '—'}`;
  return `[http] ${ts} IST | ip=${ip} | req=${rid} | ${msg} | ${route} → ${statusCode} (${ms}ms)`;
}

/**
 * Error log prefix line (same time/IP style as HTTP access).
 * @param {import('express').Request} req
 */
export function formatErrorLogPrefix(req) {
  const ts = formatIst12h();
  const ip = getClientIp(req);
  const rid = req.requestId || '—';
  const route = `${req.method || '—'} ${req.originalUrl || req.url || '—'}`;
  return `${ts} IST | ip=${ip} | req=${rid} | ${route}`;
}
