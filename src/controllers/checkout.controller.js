import { quoteShippingForUser } from '../services/shipping.service.js';
import { z } from 'zod';
import { placeCodOrder } from '../services/order.service.js';

const quoteBodySchema = z
  .object({
    paymentType: z.enum(['Prepaid', 'COD']).optional(),
  })
  .strict();

export async function quote(req, res, next) {
  try {
    const userId = req.authUser?.id;
    const parsed = quoteBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      const err = new Error('Invalid request');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      err.details = parsed.error.flatten();
      throw err;
    }
    const data = await quoteShippingForUser(userId, parsed.data);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

const placeBodySchema = z
  .object({
    paymentMethod: z.enum(['cod']).optional(),
  })
  .strict();

export async function place(req, res, next) {
  try {
    const userId = req.authUser?.id;
    const parsed = placeBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      const err = new Error('Invalid request');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      err.details = parsed.error.flatten();
      throw err;
    }

    // Only COD is supported end-to-end for now.
    const data = await placeCodOrder(userId);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

