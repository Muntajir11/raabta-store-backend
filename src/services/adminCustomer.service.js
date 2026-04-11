import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { Order } from '../models/order.model.js';

function nullIfEmpty(v) {
  if (v == null || v === '') return null;
  return v;
}

function userPublicDto(u) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    phone: nullIfEmpty(u.phone),
    city: nullIfEmpty(u.city),
    address: nullIfEmpty(u.address),
    gender: nullIfEmpty(u.gender),
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function orderDto(o) {
  return {
    id: o.orderNumber,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    items: o.items,
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

/**
 * @param {{ q?: string }} filters
 */
export async function listCustomersAdmin(filters = {}) {
  const match = { role: 'user' };
  const q = filters.q && String(filters.q).trim();
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    match.$or = [{ name: rx }, { email: rx }, { phone: rx }, { city: rx }];
  }

  const pipeline = [
    { $match: match },
    {
      $project: {
        email: 1,
        name: 1,
        phone: 1,
        city: 1,
        address: 1,
        gender: 1,
        role: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      $lookup: {
        from: 'orders',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              spent: { $sum: '$total' },
            },
          },
        ],
        as: 'orderStats',
      },
    },
    {
      $addFields: {
        ordersCount: {
          $ifNull: [{ $arrayElemAt: ['$orderStats.count', 0] }, 0],
        },
        totalSpent: {
          $ifNull: [{ $arrayElemAt: ['$orderStats.spent', 0] }, 0],
        },
      },
    },
    { $project: { orderStats: 0 } },
    { $sort: { createdAt: -1 } },
  ];

  const rows = await User.aggregate(pipeline);
  return rows.map((u) => ({
    ...userPublicDto(u),
    ordersCount: u.ordersCount,
    totalSpent: Number(u.totalSpent.toFixed ? u.totalSpent.toFixed(2) : u.totalSpent),
  }));
}

/**
 * @param {string} userId
 */
export async function getCustomerDetailAdmin(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    err.code = 'INVALID_USER_ID';
    throw err;
  }

  const user = await User.findById(userId)
    .select('email name phone city address gender role createdAt updatedAt')
    .lean();

  if (!user || user.role !== 'user') {
    const err = new Error('Customer not found');
    err.statusCode = 404;
    err.code = 'CUSTOMER_NOT_FOUND';
    throw err;
  }

  const orders = await Order.find({ userId: user._id }).sort({ createdAt: -1 }).lean();

  return {
    user: {
      ...userPublicDto(user),
      phone: nullIfEmpty(user.phone),
      city: nullIfEmpty(user.city),
      address: nullIfEmpty(user.address),
      gender: nullIfEmpty(user.gender),
    },
    orders: orders.map(orderDto),
  };
}
