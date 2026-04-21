import { Cart } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { InventoryAdjustment } from '../models/inventoryAdjustment.model.js';
import { computeEffectiveInventoryForProducts } from './inventoryLedger.service.js';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function variantKey(productId, size, color, gsm) {
  return `${String(productId)}|${String(size).trim().toUpperCase()}|${String(color)
    .trim()
    .toLowerCase()}|${Number(gsm)}`;
}

function normalizeInvRow(r) {
  return {
    size: String(r?.size || '').trim().toUpperCase(),
    color: String(r?.color || '').trim(),
    colorKey: String(r?.color || '').trim().toLowerCase(),
    gsm: Number(r?.gsm),
    baseQty: typeof r?.baseQty === 'number' ? r.baseQty : Number(r?.baseQty) || 0,
    adjustmentsQty: typeof r?.adjustmentsQty === 'number' ? r.adjustmentsQty : Number(r?.adjustmentsQty) || 0,
    effectiveQty: typeof r?.effectiveQty === 'number' ? r.effectiveQty : Number(r?.effectiveQty) || 0,
    reorderPoint: typeof r?.reorderPoint === 'number' ? r.reorderPoint : Number(r?.reorderPoint) || 5,
  };
}

async function reservedByVariant() {
  const rows = await Cart.aggregate([
    { $unwind: '$items' },
    {
      $group: {
        _id: {
          productId: '$items.productId',
          size: { $toUpper: '$items.size' },
          colorKey: { $toLower: '$items.color' },
          gsm: '$items.gsm',
        },
        qty: { $sum: '$items.qty' },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    const k = variantKey(r._id.productId, r._id.size, r._id.colorKey, r._id.gsm);
    map.set(k, Number(r.qty) || 0);
  }
  return map;
}

/**
 * @param {{ q?: string; lowOnly?: boolean }} input
 */
export async function listInventoryProductsAdmin(input = {}) {
  const q = typeof input.q === 'string' ? input.q.trim() : '';
  const lowOnly = Boolean(input.lowOnly);

  const query = { isActive: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    query.$or = [{ productId: rx }, { name: rx }, { category: rx }];
  }

  const products = await Product.find(query)
    .select('productId name category inventory updatedAt')
    .sort({ updatedAt: -1, productId: 1 })
    .lean();

  const withEffective = await computeEffectiveInventoryForProducts(products);
  const reservedMap = await reservedByVariant();

  const items = withEffective
    .map((p) => {
      const inv = Array.isArray(p.inventory) ? p.inventory : [];
      const variants = inv
        .map((row) => {
          const n = normalizeInvRow(row);
          if (!n.size || !n.colorKey || !Number.isFinite(n.gsm)) return null;
          const reserved = reservedMap.get(variantKey(p.productId, n.size, n.colorKey, n.gsm)) || 0;
          const onHand = n.effectiveQty;
          const available = Math.max(0, onHand - reserved);
          const low = available <= n.reorderPoint;
          return {
            productId: p.productId,
            size: n.size,
            color: n.color,
            gsm: n.gsm,
            baseQty: n.baseQty,
            adjustmentsQty: n.adjustmentsQty,
            onHand,
            reserved,
            available,
            reorderPoint: n.reorderPoint,
            low,
            updatedAt: p.updatedAt,
            sku: `${p.productId}-${n.size}-${n.color}-${n.gsm}`,
          };
        })
        .filter(Boolean);

      const totals = variants.reduce(
        (acc, v) => {
          acc.onHand += v.onHand;
          acc.reserved += v.reserved;
          acc.available += v.available;
          acc.lowVariants += v.low ? 1 : 0;
          return acc;
        },
        { onHand: 0, reserved: 0, available: 0, lowVariants: 0 }
      );

      const keep = !lowOnly || totals.lowVariants > 0;
      if (!keep) return null;

      return {
        productId: p.productId,
        name: p.name,
        category: p.category,
        updatedAt: p.updatedAt,
        totalVariants: variants.length,
        totalOnHand: totals.onHand,
        totalReserved: totals.reserved,
        totalAvailable: totals.available,
        lowVariantsCount: totals.lowVariants,
        variants,
      };
    })
    .filter(Boolean);

  return { items };
}

/**
 * @param {{ productId: string; size: string; color: string; gsm: number; limit?: number }} input
 */
export async function listInventoryHistoryAdmin(input) {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 50)));
  const items = await InventoryAdjustment.find({
    productId: String(input.productId).trim(),
    size: String(input.size).trim(),
    color: String(input.color).trim(),
    gsm: Number(input.gsm),
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    items: items.map((a) => ({
      id: String(a._id),
      createdAt: a.createdAt,
      delta: a.delta,
      reason: a.reason,
      note: a.note || '',
      createdBy: String(a.createdBy),
      refType: a.refType || '',
      refId: a.refId || '',
    })),
  };
}

