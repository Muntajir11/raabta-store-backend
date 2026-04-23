import { User } from '../models/user.model.js';
import { Order } from '../models/order.model.js';
import { InventoryAdjustment } from '../models/inventoryAdjustment.model.js';

/**
 * @param {import('mongoose').Document} doc
 */
export function toProfileUser(doc) {
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email,
    role: doc.role || 'user',
    gender: doc.gender ?? '',
    avatarSeed: doc.avatarSeed ?? '',

    shippingName: doc.shippingName ?? '',
    shippingPhone: doc.shippingPhone ?? '',
    shippingAddressLine1: doc.shippingAddressLine1 ?? '',
    shippingAddressLine2: doc.shippingAddressLine2 ?? '',
    shippingLandmark: doc.shippingLandmark ?? '',
    shippingPincode: doc.shippingPincode ?? '',
    shippingCity: doc.shippingCity ?? '',
    shippingState: doc.shippingState ?? '',
    shippingCountry: doc.shippingCountry ?? 'India',
    deliveryInstructions: doc.deliveryInstructions ?? '',

    // Legacy fields (kept for backward compatibility in older UIs).
    phone: doc.phone ?? '',
    state: doc.state ?? '',
    city: doc.city ?? '',
    pincode: doc.pincode ?? '',
    landmark: doc.landmark ?? '',
    address: doc.address ?? '',
    marketingOptIn: Boolean(doc.marketingOptIn),
  };
}

/**
 * @param {string} userId
 */
export async function getProfileById(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.details = { reason: 'user_not_found', context: 'getProfileById' };
    throw err;
  }
  return toProfileUser(user);
}

/**
 * @param {string} userId
 * @param {{
 *   name?: string;
 *   phone?: string;
 *   city?: string;
 *   address?: string;
 *   gender?: string;
 *   marketingOptIn?: boolean;
 * }} patch
 */
export async function updateProfile(userId, patch) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.details = { reason: 'user_not_found', context: 'updateProfile' };
    throw err;
  }

  if (patch.name !== undefined) user.name = patch.name;
  if (patch.gender !== undefined) user.gender = patch.gender;
  if (patch.marketingOptIn !== undefined) user.marketingOptIn = patch.marketingOptIn;

  if (patch.shippingName !== undefined) user.shippingName = patch.shippingName;
  if (patch.shippingPhone !== undefined) user.shippingPhone = patch.shippingPhone;
  if (patch.shippingAddressLine1 !== undefined) user.shippingAddressLine1 = patch.shippingAddressLine1;
  if (patch.shippingAddressLine2 !== undefined) user.shippingAddressLine2 = patch.shippingAddressLine2;
  if (patch.shippingLandmark !== undefined) user.shippingLandmark = patch.shippingLandmark;
  if (patch.shippingPincode !== undefined) user.shippingPincode = patch.shippingPincode;
  if (patch.shippingCity !== undefined) user.shippingCity = patch.shippingCity;
  if (patch.shippingState !== undefined) user.shippingState = patch.shippingState;
  if (patch.shippingCountry !== undefined) user.shippingCountry = patch.shippingCountry;
  if (patch.deliveryInstructions !== undefined) user.deliveryInstructions = patch.deliveryInstructions;

  // Derive legacy fields used by existing checkout/order snapshot logic (until fully migrated).
  if (
    patch.shippingPhone !== undefined ||
    patch.shippingAddressLine1 !== undefined ||
    patch.shippingAddressLine2 !== undefined ||
    patch.shippingCity !== undefined ||
    patch.shippingState !== undefined ||
    patch.shippingPincode !== undefined ||
    patch.shippingLandmark !== undefined
  ) {
    user.phone = String(user.shippingPhone || '').trim();
    user.address = [user.shippingAddressLine1, user.shippingAddressLine2].filter(Boolean).join(', ').trim();
    user.city = String(user.shippingCity || '').trim();
    user.state = String(user.shippingState || '').trim();
    user.pincode = String(user.shippingPincode || '').trim();
    user.landmark = String(user.shippingLandmark || '').trim();
  }

  await user.save();
  return toProfileUser(user);
}

function orderListDto(o) {
  const first = Array.isArray(o.items) && o.items.length ? o.items[0] : null;
  return {
    id: o.orderNumber,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    status: o.status,
    total: o.total,
    itemsCount: Array.isArray(o.items) ? o.items.reduce((n, i) => n + (Number(i.qty) || 0), 0) : 0,
    firstItem: first
      ? {
          productId: String(first.productId || ''),
          name: String(first.name || ''),
          image: String(first.image || ''),
          size: String(first.size || ''),
          color: String(first.color || ''),
          gsm: Number(first.gsm || 0),
        }
      : null,
    moreCount: Math.max(0, (Array.isArray(o.items) ? o.items.length : 0) - 1),
  };
}

function orderDetailDto(o) {
  return {
    id: o.orderNumber,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    items: o.items || [],
    subtotal: o.subtotal,
    shipping: o.shipping,
    shippingExclGst: typeof o.shippingExclGst === 'number' ? o.shippingExclGst : null,
    shippingGst: o.shippingGst || null,
    total: o.total,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    status: o.status,
    notes: o.notes || '',
    shippingAddress: o.shippingAddress || null,
  };
}

export async function listMyOrders(userId, input = {}) {
  const page = Math.max(1, Math.floor(Number(input.page || 1)));
  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit || 30))));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Order.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments({ userId }),
  ]);

  return { items: items.map(orderListDto), page, limit, total };
}

export async function getMyOrder(userId, orderNumber) {
  const on = String(orderNumber || '').trim();
  if (!on) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  const order = await Order.findOne({ userId, orderNumber: on }).lean();
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  return orderDetailDto(order);
}

/**
 * Customer-initiated cancel: allowed only before shipped.
 * @param {string} userId
 * @param {string} orderNumber
 */
export async function cancelMyOrder(userId, orderNumber) {
  const on = String(orderNumber || '').trim();
  if (!on) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  const before = await Order.findOne({ userId, orderNumber: on }).lean();
  if (!before) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  const status = String(before.status || '').trim();
  if (status === 'cancelled' || status === 'refunded') {
    return orderDetailDto(before);
  }
  if (status === 'shipped' || status === 'delivered') {
    const err = new Error('This order can’t be cancelled after it has shipped');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = { reason: 'already_shipped', status };
    throw err;
  }

  const updated = await Order.findOneAndUpdate(
    { userId, orderNumber: on, status: { $nin: ['shipped', 'delivered', 'cancelled', 'refunded'] } },
    { $set: { status: 'cancelled' } },
    { new: true }
  ).lean();

  if (!updated) {
    const err = new Error('This order can’t be cancelled after it has shipped');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = { reason: 'already_shipped' };
    throw err;
  }

  const actorUserId = String(userId || '').trim();
  if (actorUserId && before.inventoryReserved) {
    const items = Array.isArray(before.items) ? before.items : [];
    if (items.length) {
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
        { ordered: true }
      );
      await Order.updateOne({ userId, orderNumber: on }, { $set: { inventoryReserved: false } });
      updated.inventoryReserved = false;
    }
  }

  return orderDetailDto(updated);
}
