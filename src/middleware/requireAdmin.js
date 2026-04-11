/**
 * Must run after requireAuth.
 * @type {import('express').RequestHandler}
 */
export function requireAdmin(req, res, next) {
  if (req.authUser?.role !== 'admin') {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    err.details = { reason: 'admin_only', context: 'requireAdmin' };
    return next(err);
  }
  next();
}
