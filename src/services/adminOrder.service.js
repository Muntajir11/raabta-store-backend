import { z } from 'zod';
import mongoose from 'mongoose';
import { Order } from '../models/order.model.js';
import { InventoryAdjustment } from '../models/inventoryAdjustment.model.js';

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
    paymentMethod: o.paymentMethod || 'cod',
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
    shippingExclGst: typeof o.shippingExclGst === 'number' ? o.shippingExclGst : null,
    shippingGst: o.shippingGst || null,
    total: o.total,
    paymentMethod: o.paymentMethod || 'cod',
    paymentStatus: o.paymentStatus,
    status: o.status,
    notes: o.notes || '',
    customerName: o.customerName || '',
    customerEmail: o.customerEmail || '',
    city: o.city || '',
    shippingAddress: o.shippingAddress || null,
    inventoryReserved: Boolean(o.inventoryReserved),
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
 * @param {{ userId?: string }} [actor]
 */
export async function patchOrderAdmin(orderNumber, patch, actor = {}) {
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

  const actorUserId = String(actor?.userId || '').trim();
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      const before = await Order.findOne({ orderNumber: on }).session(session).lean();
      if (!before) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      updated = await Order.findOneAndUpdate(
        { orderNumber: on },
        { $set: patch },
        { new: true, session }
      ).lean();
      if (!updated) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      const statusChanged = typeof patch.status === 'string' && patch.status !== before.status;
      if (!actorUserId || !statusChanged) return;

      const items = Array.isArray(before.items) ? before.items : [];
      if (!items.length) return;

      if (patch.status === 'confirmed' && !before.inventoryReserved) {
        await InventoryAdjustment.insertMany(
          items.map((i) => ({
            productId: i.productId,
            size: i.size,
            color: i.color,
            gsm: i.gsm,
            delta: -Math.max(0, Number(i.qty) || 0),
            reason: 'order',
            note: `Reserved for order ${on}`,
            createdBy: actorUserId,
            refType: 'order',
            refId: on,
          })),
          { ordered: true, session }
        );

        const r = await Order.updateOne(
          { orderNumber: on, inventoryReserved: false },
          { $set: { inventoryReserved: true } },
          { session }
        );
        if (r.modifiedCount === 1) updated.inventoryReserved = true;
      }

      if (patch.status === 'cancelled' && before.inventoryReserved) {
        await InventoryAdjustment.insertMany(
          items.map((i) => ({
            productId: i.productId,
            size: i.size,
            color: i.color,
            gsm: i.gsm,
            delta: Math.max(0, Number(i.qty) || 0),
            reason: 'cancel',
            note: `Restored from cancelled order ${on}`,
            createdBy: actorUserId,
            refType: 'order',
            refId: on,
          })),
          { ordered: true, session }
        );

        const r = await Order.updateOne(
          { orderNumber: on, inventoryReserved: true },
          { $set: { inventoryReserved: false } },
          { session }
        );
        if (r.modifiedCount === 1) updated.inventoryReserved = false;
      }
    });
    return orderDetailDto(updated);
  } finally {
    session.endSession();
  }
}

