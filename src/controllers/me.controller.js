import { z } from 'zod';
import { setAuthCookies } from '../lib/authTokens.js';
import * as authService from '../services/auth.service.js';
import * as meService from '../services/me.service.js';
import { INDIAN_STATES } from '../lib/indiaStates.js';

const PHONE_REGEX = /^[6-9]\d{9}$/;
const PINCODE_REGEX = /^\d{6}$/;

function stripEmptyStrings(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.trim() === '') {
      delete out[k];
    }
  }
  return out;
}

const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    phone: z
      .string()
      .trim()
      .regex(PHONE_REGEX, 'Enter a valid phone number')
      .optional(),
    address: z.string().trim().min(5, 'Street address is required').max(500).optional(),
    city: z.string().trim().min(2, 'City is required').max(120).optional(),
    state: z
      .string()
      .trim()
      .refine((v) => INDIAN_STATES.includes(v), 'State is required')
      .optional(),
    pincode: z
      .string()
      .trim()
      .regex(PINCODE_REGEX, 'Enter a valid pincode')
      .optional(),
    landmark: z.string().trim().max(120).optional(),
    gender: z.string().trim().max(32).optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const addressKeys = ['address', 'city', 'state', 'pincode', 'phone'];
    const hasAnyAddressField = addressKeys.some((k) => data[k] !== undefined);
    if (!hasAnyAddressField) return;

    for (const k of addressKeys) {
      if (data[k] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'All address fields are required',
          path: [k],
        });
      }
    }
  });

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? 'Validation failed';
}

/**
 * GET /api/me
 */
export async function getMe(req, res, next) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const profile = await meService.getProfileById(userId);
    return res.status(200).json({ success: true, data: { user: profile } });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/me
 */
export async function patchMe(req, res, next) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const parsed = profilePatchSchema.safeParse(stripEmptyStrings(req.body));
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const body = parsed.data;
    const keys = Object.keys(body);
    if (keys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
        code: 'VALIDATION_ERROR',
      });
    }

    const profile = await meService.updateProfile(userId, body);
    req.logMessage = `${req.authUser?.name || 'User'} updated profile`;
    return res.status(200).json({ success: true, data: { user: profile } });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/me/password
 */
export async function patchPassword(req, res, next) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const { currentPassword, newPassword } = parsed.data;
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password',
        code: 'VALIDATION_ERROR',
      });
    }

    const data = await authService.updatePasswordAndRotateSession(userId, currentPassword, newPassword);
    setAuthCookies(res, data.accessToken, data.refreshToken);
    req.logMessage = `${data.user.name} changed password`;
    return res.status(200).json({ success: true, data: { user: data.user } });
  } catch (err) {
    return next(err);
  }
}
