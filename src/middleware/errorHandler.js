/**
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, _req, res, _next) {
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';
  const code = err.code;

  const level = status >= 500 ? 'error' : 'warn';
  console[level](`[errorHandler] status=${status} code=${code || 'N/A'}`);
  if (status === 500) console.error(err);

  res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {}),
  });
}
