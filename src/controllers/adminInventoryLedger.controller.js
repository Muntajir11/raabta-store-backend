import { z } from 'zod';
import * as adminInventoryLedgerService from '../services/adminInventoryLedger.service.js';
import { InventoryAdjustment } from '../models/inventoryAdjustment.model.js';

const adjustSchema = z
  .object({
    productId: z.string().trim().min(1).max(120),
    size: z.string().trim().min(1).max(20),
    color: z.string().trim().min(1).max(60),
    gsm: z.coerce.number().refine((n) => n === 180 || n === 210 || n === 240, { message: 'gsm must be 180, 210, or 240' }),
    delta: z.coerce.number().int().min(-1000000).max(1000000),
    reason: z.enum(['manual', 'received', 'damage', 'correction', 'order', 'refund', 'cancel']),
    note: z.string().max(500).optional().default(''),
  })
  .strict();

function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? 'Validation failed';
}

export async function listProducts(req, res, next) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const lowOnly = req.query.lowOnly === 'true' || req.query.lowOnly === '1';
    const data = await adminInventoryLedgerService.listInventoryProductsAdmin({ q, lowOnly });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

export async function adjust(req, res, next) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const parsed = adjustSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const body = parsed.data;
    const doc = await InventoryAdjustment.create({
      productId: body.productId,
      size: body.size,
      color: body.color,
      gsm: body.gsm,
      delta: body.delta,
      reason: body.reason,
      note: body.note,
      createdBy: userId,
    });

    req.logMessage = `${req.authUser?.name || 'Admin'} adjusted stock for ${body.productId} ${body.size} ${body.color} ${body.gsm}gsm (${body.delta})`;
    return res.status(201).json({ success: true, data: { id: String(doc._id) } });
  } catch (err) {
    return next(err);
  }
}

export async function history(req, res, next) {
  try {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : '';
    const size = typeof req.query.size === 'string' ? req.query.size : '';
    const color = typeof req.query.color === 'string' ? req.query.color : '';
    const gsm = typeof req.query.gsm === 'string' ? Number(req.query.gsm) : Number(req.query.gsm);
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;

    if (!productId || !size || !color || !Number.isFinite(gsm)) {
      return res.status(400).json({
        success: false,
        message: 'productId, size, color, gsm are required',
        code: 'VALIDATION_ERROR',
      });
    }

    const data = await adminInventoryLedgerService.listInventoryHistoryAdmin({
      productId,
      size,
      color,
      gsm,
      limit,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

