import { z } from 'zod';
import * as designService from '../services/design.service.js';

const createDesignSchema = z
  .object({
    productId: z.string().trim().min(1).max(120),
    gsm: z.coerce.number().refine((n) => n === 180 || n === 210 || n === 240, { message: 'gsm must be 180, 210, or 240' }),
    size: z.string().trim().min(1).max(20),
    color: z.string().trim().min(1).max(60),
    sides: z
      .array(
        z.object({
          view: z.string().trim().min(1).max(30),
          hasPrint: z.boolean(),
          printSize: z.string().trim().max(10).optional(),
          guidePositionId: z.string().trim().max(60).optional(),
        })
      )
      .default([]),
    designJson: z.string().min(2).max(200000),
    blankRs: z.coerce.number().min(0),
    totalRs: z.coerce.number().min(0),
    // For now, assets are expected to be uploaded server-side from checkout flow.
    // This endpoint is ready, but storefront won't call it until Razorpay/checkout is implemented.
  })
  .strict();

function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? 'Validation failed';
}

/**
 * POST /api/designs
 */
export async function create(req, res, next) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const parsed = createDesignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const created = await designService.createDesignAfterCheckout(userId, parsed.data);
    req.logMessage = `${req.authUser?.name || 'a user'} submitted a custom design ${created.id}`;
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    return next(err);
  }
}

