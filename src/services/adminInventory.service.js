import { Product } from '../models/product.model.js';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inventory rows per (productId,size,color,gsm).
 * onHand comes from Product.inventory.qty
 * reserved comes from Cart.items qty summed across all carts
 *
 * @param {{ q?: string; lowOnly?: boolean }} input
 */
export async function listInventoryAdmin(input = {}) {
  const q = typeof input.q === 'string' ? input.q.trim() : '';
  const lowOnly = Boolean(input.lowOnly);

  const matchStages = [];
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    matchStages.push({
      $match: {
        $or: [{ productId: rx }, { name: rx }, { category: rx }],
      },
    });
  }

  const pipeline = [
    ...matchStages,
    { $unwind: '$inventory' },
    {
      $project: {
        productId: 1,
        updatedAt: 1,
        size: '$inventory.size',
        color: '$inventory.color',
        gsm: '$inventory.gsm',
        onHand: '$inventory.qty',
        reorderPoint: { $ifNull: ['$inventory.reorderPoint', 5] },
      },
    },
    {
      $lookup: {
        from: 'carts',
        let: {
          pid: '$productId',
          size: '$size',
          color: '$color',
          gsm: '$gsm',
        },
        pipeline: [
          { $unwind: '$items' },
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$items.productId', '$$pid'] },
                  { $eq: ['$items.size', '$$size'] },
                  { $eq: ['$items.color', '$$color'] },
                  { $eq: ['$items.gsm', '$$gsm'] },
                ],
              },
            },
          },
          { $group: { _id: null, qty: { $sum: '$items.qty' } } },
        ],
        as: 'reservedAgg',
      },
    },
    {
      $addFields: {
        reserved: { $ifNull: [{ $arrayElemAt: ['$reservedAgg.qty', 0] }, 0] },
      },
    },
    {
      $addFields: {
        available: {
          $max: [{ $subtract: ['$onHand', '$reserved'] }, 0],
        },
      },
    },
    { $project: { reservedAgg: 0 } },
  ];

  if (lowOnly) {
    pipeline.push({
      $match: {
        $expr: { $lte: ['$available', '$reorderPoint'] },
      },
    });
  }

  pipeline.push({ $sort: { available: 1, updatedAt: -1 } });

  const rows = await Product.aggregate(pipeline);
  return rows.map((r) => {
    const sku = `${r.productId}-${r.size}-${r.color}-${r.gsm}`;
    return {
      sku,
      productId: r.productId,
      size: r.size,
      color: r.color,
      gsm: r.gsm,
      onHand: Number(r.onHand) || 0,
      reserved: Number(r.reserved) || 0,
      available: Number(r.available) || 0,
      reorderPoint: Number(r.reorderPoint) || 0,
      updatedAt: r.updatedAt,
    };
  });
}

