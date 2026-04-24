import { z } from 'zod';
import mongoose from 'mongoose';
import { SupportTicket } from '../models/supportTicket.model.js';

const listQuerySchema = z
  .object({
    status: z.enum(['open', 'resolved']).optional(),
  })
  .strict();

const patchSchema = z
  .object({
    status: z.enum(['open', 'resolved']),
  })
  .strict();

function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? 'Validation failed';
}

function ticketRow(t) {
  return {
    id: String(t._id),
    name: t.name,
    email: t.email,
    phone: t.phone,
    status: t.status,
    createdAt: t.createdAt,
    resolvedAt: t.resolvedAt || null,
  };
}

/**
 * GET /api/admin/support/tickets
 */
export async function list(req, res, next) {
  try {
    const parsed = listQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const filter = {};
    if (parsed.data.status) filter.status = parsed.data.status;

    const items = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return res.status(200).json({ success: true, data: { items: items.map(ticketRow) } });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/admin/support/tickets/:ticketId
 */
export async function getOne(req, res, next) {
  try {
    const ticketId = String(req.params.ticketId || '').trim();
    if (!mongoose.isValidObjectId(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket id', code: 'VALIDATION_ERROR' });
    }

    const t = await SupportTicket.findById(ticketId).lean();
    if (!t) {
      return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
    }

    return res.status(200).json({
      success: true,
      data: {
        ticket: {
          id: String(t._id),
          name: t.name,
          email: t.email,
          phone: t.phone,
          message: t.message,
          status: t.status,
          createdAt: t.createdAt,
          resolvedAt: t.resolvedAt || null,
          resolvedBy: t.resolvedBy ? String(t.resolvedBy) : null,
          meta: t.meta || null,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/admin/support/tickets/:ticketId
 */
export async function patch(req, res, next) {
  try {
    const ticketId = String(req.params.ticketId || '').trim();
    if (!mongoose.isValidObjectId(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket id', code: 'VALIDATION_ERROR' });
    }

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const status = parsed.data.status;
    const now = new Date();
    const update =
      status === 'resolved'
        ? { status, resolvedAt: now, resolvedBy: req.authUser?.id || null }
        : { status, resolvedAt: null, resolvedBy: null };

    const updated = await SupportTicket.findByIdAndUpdate(ticketId, update, { new: true }).lean();
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
    }

    return res.status(200).json({ success: true, data: { ticket: ticketRow(updated) } });
  } catch (err) {
    return next(err);
  }
}

