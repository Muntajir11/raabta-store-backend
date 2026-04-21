import { z } from 'zod';
import { Order } from '../models/order.model.js';

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'in_production',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function orderListDto(o) {
  return {
    id: o.orderNumber,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    customerName: o.customerName || '',
    customerEmail: o.customerEmail || '',
    city: o.city || '',
    paymentStatus: o.paymentStatus,
    status: o.status,
    total: o.total,
    itemsCount: Array.isArray(o.items) ? o.items.reduce((n, i) => n + (Number(i.qty) || 0), 0) : 0,
  };
}

function orderDetailDto(o) {
  return {
    id: o.orderNumber,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    userId: String(o.userId),
    items: o.items || [],
    subtotal: o.subtotal,
    shipping: o.shipping,
    total: o.total,
    paymentStatus: o.paymentStatus,
    status: o.status,
    notes: o.notes || '',
    customerName: o.customerName || '',
    customerEmail: o.customerEmail || '',
    city: o.city || '',
  };
}

export const orderPatchSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

/**
 * @param {{
 *   q?: string;
 *   status?: string;
 *   paymentStatus?: string;
 *   page?: number;
 *   limit?: number;
 * }} input
 */
export async function listOrdersAdmin(input = {}) {
  const page = Math.max(1, Math.floor(Number(input.page || 1)));
  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit || 30))));
  const skip = (page - 1) * limit;

  const match = {};
  const q = typeof input.q === 'string' ? input.q.trim() : '';
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    match.$or = [{ orderNumber: rx }, { customerName: rx }, { customerEmail: rx }, { city: rx }];
  }
  if (typeof input.status === 'string' && ORDER_STATUSES.includes(input.status)) {
    match.status = input.status;
  }
  if (typeof input.paymentStatus === 'string' && PAYMENT_STATUSES.includes(input.paymentStatus)) {
    match.paymentStatus = input.paymentStatus;
  }

  const [items, total] = await Promise.all([
    Order.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(match),
  ]);

  return {
    items: items.map(orderListDto),
    page,
    limit,
    total,
  };
}

/**
 * @param {string} orderNumber
 */
export async function getOrderAdmin(orderNumber) {
  const on = String(orderNumber || '').trim();
  if (!on) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }
  const order = await Order.findOne({ orderNumber: on }).lean();
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }
  return orderDetailDto(order);
}

/**
 * @param {string} orderNumber
 * @param {{ status?: string; paymentStatus?: string; notes?: string }} patch
 */
export async function patchOrderAdmin(orderNumber, patch) {
  const on = String(orderNumber || '').trim();
  if (!on) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  const keys = Object.keys(patch || {});
  if (keys.length === 0) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const updated = await Order.findOneAndUpdate(
    { orderNumber: on },
    { $set: patch },
    { new: true }
  ).lean();

  if (!updated) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }
  return orderDetailDto(updated);
}

