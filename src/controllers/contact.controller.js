import { z } from 'zod';
import { SupportTicket } from '../models/supportTicket.model.js';
import { getClientIp } from '../lib/requestLog.js';

const phoneSchema = z.string().trim().min(7, 'Phone is required').max(32);

const contactSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    email: z.string().trim().email('Invalid email').max(254),
    phone: phoneSchema,
    message: z.string().trim().min(10, 'Message is too short').max(6000),
  })
  .strict();

function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? 'Validation failed';
}

/**
 * POST /api/contact
 */
export async function create(req, res, next) {
  try {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZodError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const ua = String(req.get('user-agent') || '').slice(0, 500);
    const ip = getClientIp(req) || '';

    const ticket = await SupportTicket.create({
      ...parsed.data,
      status: 'open',
      meta: { ip, userAgent: ua },
    });

    return res.status(201).json({ success: true, data: { id: String(ticket._id) } });
  } catch (err) {
    return next(err);
  }
}

