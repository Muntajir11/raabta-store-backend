import mongoose from 'mongoose';
import { Counter } from '../models/counter.model.js';
import { Order } from '../models/order.model.js';
import { User } from '../models/user.model.js';
import { Cart } from '../models/cart.model.js';
import { quoteShippingForUser } from './shipping.service.js';

const ORDER_NUMBER_COUNTER_ID = 'orderNumber';

function pad(num, width) {
  const s = String(num);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

async function allocateNextOrderNumber() {
  const updated = await Counter.findOneAndUpdate(
    { _id: ORDER_NUMBER_COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  ).lean();

  const seq = Number(updated?.seq || 0);
  if (!Number.isFinite(seq) || seq <= 0) {
    const err = new Error('Failed to allocate order number');
    err.statusCode = 503;
    err.code = 'ORDER_NUMBER_ALLOCATION_FAILED';
    throw err;
  }

  return `RAB-${pad(seq, 6)}`;
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
    paymentMethod: o.paymentMethod,
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

async function placeCodOrderInternal(userId, session) {
  const uid = String(userId || '').trim();
  if (!uid) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const user = await User.findById(uid).session(session).lean();
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const cart = await Cart.findOne({ userId: uid }).session(session);
  const cartItems = Array.isArray(cart?.items) ? cart.items : [];
  if (!cart || cartItems.length === 0) {
    const err = new Error('Your cart is empty');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = { reason: 'empty_cart' };
    throw err;
  }

  const quote = await quoteShippingForUser(uid, { paymentType: 'COD' });
  const lines = quote?.shippingBreakdown?.lines || [];
  const findAmount = (key) => {
    const row = lines.find((l) => l && typeof l.key === 'string' && l.key === key);
    const v = row?.amount;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const shippingExclGst = findAmount('gross');
  const cgst = findAmount('cgst');
  const sgst = findAmount('sgst');
  const igst = findAmount('igst');

  const orderNumber = await allocateNextOrderNumber();
  const orderItems = cartItems.map((i) => ({
    productId: String(i.productId || '').trim(),
    name: String(i.name || '').trim(),
    image: String(i.image || '').trim(),
    category: String(i.category || '').trim(),
    size: String(i.size || '').trim(),
    color: String(i.color || '').trim(),
    gsm: Number(i.gsm),
    qty: Number(i.qty),
    unitPrice: Number(i.price),
  }));

  const shippingAddress = {
    phone: String(user.shippingPhone || user.phone || '').trim(),
    address: [String(user.shippingAddressLine1 || '').trim(), String(user.shippingAddressLine2 || '').trim()]
      .filter(Boolean)
      .join(', ')
      .trim(),
    city: String(user.shippingCity || user.city || '').trim(),
    state: String(user.shippingState || user.state || '').trim(),
    pincode: String(user.shippingPincode || user.pincode || '').trim(),
    landmark: String(user.shippingLandmark || user.landmark || '').trim(),
  };

  const order = await Order.create(
    [
      {
        userId: uid,
        orderNumber,
        items: orderItems,
        subtotal: quote.subtotal,
        shipping: quote.shipping,
        shippingExclGst,
        shippingGst: { cgst, sgst, igst },
        total: quote.total,
        paymentMethod: 'cod',
        paymentStatus: 'unpaid',
        status: 'pending',
        customerName: String(user.name || '').trim(),
        customerEmail: String(user.email || '').trim(),
        city: String(user.city || '').trim(),
        shippingAddress,
        inventoryReserved: false,
      },
    ],
    { session }
  );

  cart.items = [];
  await cart.save({ session });

  return orderDetailDto(order[0]);
}

export async function placeCodOrder(userId) {
  const canTransact = typeof mongoose?.startSession === 'function';
  if (!canTransact) {
    // Extremely unlikely, but keep a safe fallback.
    return placeCodOrderInternal(userId, undefined);
  }

  const session = await mongoose.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      result = await placeCodOrderInternal(userId, session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

