import { InventoryAdjustment } from '../models/inventoryAdjustment.model.js';

function keyOf(productId, size, color, gsm) {
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
    qty: typeof r?.qty === 'number' ? r.qty : Number(r?.qty) || 0,
    reorderPoint: typeof r?.reorderPoint === 'number' ? r.reorderPoint : Number(r?.reorderPoint) || 5,
  };
}

/**
 * Merge base Product.inventory[] with adjustment sums.
 * Returns inventory rows with baseQty/adjustmentsQty/effectiveQty and also sets qty=eefectiveQty for compatibility.
 *
 * @param {Array<{ productId: string; inventory?: Array<any> }>} products
 */
export async function computeEffectiveInventoryForProducts(products) {
  const list = Array.isArray(products) ? products : [];
  const keys = [];
  for (const p of list) {
    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    for (const row of inv) {
      const n = normalizeInvRow(row);
      if (!n.size || !n.colorKey || !Number.isFinite(n.gsm)) continue;
      keys.push({
        productId: String(p.productId),
        size: n.size,
        colorKey: n.colorKey,
        gsm: n.gsm,
      });
    }
  }

  if (keys.length === 0) return list;

  const matchOr = keys.map((k) => ({
    productId: k.productId,
    size: k.size,
    colorKey: k.colorKey,
    gsm: k.gsm,
  }));

  // Store normalized colorKey for matching without case issues.
  // We materialize it in aggregation by lowercasing.
  const agg = await InventoryAdjustment.aggregate([
    {
      $addFields: {
        sizeKey: { $toUpper: '$size' },
        colorKey: { $toLower: '$color' },
      },
    },
    {
      $match: {
        $or: matchOr.map((m) => ({
          productId: m.productId,
          sizeKey: m.size,
          colorKey: m.colorKey,
          gsm: m.gsm,
        })),
      },
    },
    {
      $group: {
        _id: {
          productId: '$productId',
          size: '$sizeKey',
          colorKey: '$colorKey',
          gsm: '$gsm',
        },
        deltaSum: { $sum: '$delta' },
      },
    },
  ]);

  const deltaByKey = new Map();
  for (const row of agg) {
    const k = keyOf(row._id.productId, row._id.size, row._id.colorKey, row._id.gsm);
    deltaByKey.set(k, Number(row.deltaSum) || 0);
  }

  return list.map((p) => {
    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    const nextInv = inv.map((row) => {
      const n = normalizeInvRow(row);
      if (!n.size || !n.colorKey || !Number.isFinite(n.gsm)) return row;
      const k = keyOf(p.productId, n.size, n.colorKey, n.gsm);
      const adjustmentsQty = deltaByKey.get(k) || 0;
      const baseQty = Number(n.qty) || 0;
      const effectiveQty = Math.max(0, baseQty + adjustmentsQty);
      return {
        ...row,
        qty: effectiveQty,
        baseQty,
        adjustmentsQty,
        effectiveQty,
        reorderPoint: typeof row?.reorderPoint === 'number' ? row.reorderPoint : n.reorderPoint,
      };
    });
    return { ...p, inventory: nextInv };
  });
}

