import { Order } from '../models/order.model.js';
import { Product } from '../models/product.model.js';
import { User } from '../models/user.model.js';

function recentOrderDto(o) {
  return {
    id: o.orderNumber,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    customerName: o.customerName || '',
    city: o.city || '',
    status: o.status,
    total: o.total,
  };
}

export async function getDashboardAdmin() {
  const [revenueAgg, customersCount, productsCount, activeProductsCount, recentOrders] =
    await Promise.all([
      Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
      User.countDocuments({ role: 'user' }),
      Product.countDocuments({}),
      Product.countDocuments({ isActive: true }),
      Order.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

  const revenueTotal = Number(revenueAgg?.[0]?.total || 0);

  return {
    revenueTotal,
    customersCount,
    productsCount,
    activeProductsCount,
    newDesignRequests: 0,
    recentOrders: recentOrders.map(recentOrderDto),
    designQueue: [],
  };
}

