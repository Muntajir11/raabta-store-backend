import { z } from 'zod';
import * as authService from '../services/auth.service.js';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Invalid email').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});

function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? 'Validation failed';
}

/**
 * POST /api/auth/register
 */
export async function register(req, res, next) {
  try {
    console.log('[auth][register] Request received');
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn('[auth][register] Validation failed');
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }
    console.log(`[auth][register] Validation passed for email=${parsed.data.email}`);
    const data = await authService.registerUser(parsed.data);
    console.log(`[auth][register] Registration success userId=${data.user.id}`);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[auth][register] Request failed:', err?.message || err);
    return next(err);
  }
}

/**
 * POST /api/auth/login
 */
export async function login(req, res, next) {
  try {
    console.log('[auth][login] Request received');
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn('[auth][login] Validation failed');
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }
    console.log(`[auth][login] Validation passed for email=${parsed.data.email}`);
    const data = await authService.loginUser(parsed.data);
    console.log(`[auth][login] Login success userId=${data.user.id}`);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[auth][login] Request failed:', err?.message || err);
    return next(err);
  }
}
