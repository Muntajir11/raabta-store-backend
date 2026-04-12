import { formatErrorLogPrefix } from '../lib/requestLog.js';

/**
 * First stack frame outside node_modules (file:line:col) for tracing.
 * @param {string | undefined} stack
 */
function firstProjectStackFrame(stack) {
  if (!stack || typeof stack !== 'string') return null;
  for (const line of stack.split('\n')) {
    if (line.includes('node_modules')) continue;
    const matches = [...line.matchAll(/([\w\-./\\ ]+\.(?:js|mjs|ts)):(\d+):(\d+)/g)];
    for (const m of matches) {
      const fp = m[1].trim();
      if (fp.includes('node_modules')) continue;
      const normalized = fp.replace(/\\/g, '/');
      const short = normalized.includes('/backend/')
        ? normalized.split('/backend/')[1]
        : normalized.split(/[/\\]/).slice(-3).join('/');
      return `${short}:${m[2]}:${m[3]}`;
    }
  }
  return null;
}

/**
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, req, res, _next) {
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';
  const code = err.code;
  const prefix = formatErrorLogPrefix(req);
  const userPart = req.authUser?.id ? `userId=${req.authUser.id}` : 'userId=—';
  const at = firstProjectStackFrame(err.stack) || '—';
  let detailsPart = '';
  if (err.details != null && typeof err.details === 'object') {
    try {
      detailsPart = ` | details=${JSON.stringify(err.details)}`;
    } catch {
      detailsPart = ' | details=(unserializable)';
    }
  }

  const summary = `[${code || 'NO_CODE'}] ${message} (HTTP ${status}) | ${userPart} | at ${at}${detailsPart}`;

  if (status >= 500) {
    console.error('[errorHandler]', prefix, summary);
    console.error(err);
  } else {
    console.warn('[errorHandler]', prefix, summary);
  }

  res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {}),
  });
}
