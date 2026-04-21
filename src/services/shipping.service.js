import { User } from '../models/user.model.js';
import { getCartByUserId } from './cart.service.js';
import { getStoreSettings } from './adminSettings.service.js';
import { checkServiceability, getCharges } from '../lib/delhivery.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE_MAX = 500;
/** @type {Map<string, { expiresAt: number; value: any }>} */
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

function asNonEmptyString(v) {
  const s = String(v || '').trim();
  return s ? s : '';
}

function assertUserHasShipping(user) {
  const missing = [];
  if (!asNonEmptyString(user?.phone)) missing.push('phone');
  if (!asNonEmptyString(user?.address)) missing.push('address');
  if (!asNonEmptyString(user?.city)) missing.push('city');
  if (!asNonEmptyString(user?.state)) missing.push('state');
  if (!asNonEmptyString(user?.pincode)) missing.push('pincode');
  if (missing.length) {
    const err = new Error('Complete your address to continue');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = { missing };
    throw err;
  }
}

/**
 * Delhivery `cgm` is chargeable weight in grams. We send **actual packed weight**
 * (per-item grams × total units). Optional `l/b/h` are passed separately so Delhivery
 * can apply their own volumetric rules when applicable.
 */
function computeShipmentGrams({ itemCount, weightPerItemGrams }) {
  const n = Math.max(0, Math.floor(Number(itemCount || 0)));
  const w = Math.max(1, Math.floor(Number(weightPerItemGrams || 0)));
  const actualG = w * n;
  return { actualG, chargeableGrams: Math.max(1, Math.floor(actualG)) };
}

function dimsForDelhivery(dimsCm) {
  const L = Number(dimsCm?.length || 0);
  const W = Number(dimsCm?.width || 0);
  const H = Number(dimsCm?.height || 0);
  if (!Number.isFinite(L) || !Number.isFinite(W) || !Number.isFinite(H)) return null;
  if (L <= 0 || W <= 0 || H <= 0) return null;
  return {
    lengthCm: Math.round(L),
    breadthCm: Math.round(W),
    heightCm: Math.round(H),
  };
}

function pickChargesRow(body) {
  if (!body) return null;
  if (Array.isArray(body) && body.length) return body[0];
  if (Array.isArray(body?.data) && body.data.length) return body.data[0];
  if (body?.charges) return body.charges;
  return null;
}

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function pushLine(lines, key, label, amount) {
  const money = round2(amount);
  if (!money) return;
  lines.push({ key, label, amount: money });
}

function delhiveryBreakdownFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  const lines = [];

  pushLine(lines, 'freight', 'Freight', row.charge_DL);
  pushLine(lines, 'dph', 'Handling', row.charge_DPH);
  pushLine(lines, 'lastMile', 'Last-mile', row.charge_LM);
  pushLine(lines, 'peak', 'Peak', row.charge_PEAK);
  pushLine(lines, 'fuel', 'Fuel surcharge', row.charge_FS || row.charge_FSC);
  pushLine(lines, 'awb', 'AWB', row.charge_AWB);
  pushLine(lines, 'cod', 'COD', row.charge_COD);

  const gross = round2(row.gross_amount);
  if (gross) {
    lines.push({ key: 'gross', label: 'Subtotal (excl. GST)', amount: gross });
  }

  const tax = row.tax_data && typeof row.tax_data === 'object' ? row.tax_data : {};
  pushLine(lines, 'cgst', 'CGST', tax.CGST);
  pushLine(lines, 'sgst', 'SGST', tax.SGST);
  pushLine(lines, 'igst', 'IGST', tax.IGST);

  return {
    lines,
    meta: {
      chargedWeightGrams: Math.max(1, Math.floor(Number(row.charged_weight || 0))) || undefined,
      zone: typeof row.zone === 'string' && row.zone.trim() ? row.zone.trim() : undefined,
    },
  };
}

function isPrepaidServiceable(serviceabilityBody) {
  const po = serviceabilityBody?.delivery_codes?.[0]?.postal_code;
  const pre = String(po?.pre_paid || po?.prepaid || '').trim().toUpperCase();
  if (pre) return pre === 'Y';
  // Fallback variants some accounts see
  const pp = String(serviceabilityBody?.postal_code?.pre_paid || '').trim().toUpperCase();
  if (pp) return pp === 'Y';
  return false;
}

/**
 * @param {string} userId
 * @returns {Promise<{
 *  subtotal: number;
 *  shipping: number;
 *  total: number;
 *  serviceable: boolean;
 *  pincode: string;
 *  itemCount: number;
 *  chargeableGrams: number;
 *  provider: 'delhivery'|'fallback';
 * }>}
 */
export async function quoteShippingForUser(userId) {
  const [cart, user, settings] = await Promise.all([
    getCartByUserId(userId),
    User.findById(userId).lean(),
    getStoreSettings(),
  ]);

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  assertUserHasShipping(user);

  const originPin = asNonEmptyString(settings?.shipping?.originPincode);
  if (!originPin) {
    const err = new Error('Shipping origin pincode is not configured');
    err.statusCode = 500;
    err.code = 'CONFIG_ERROR';
    throw err;
  }

  const destPin = asNonEmptyString(user?.pincode);
  const itemCount = Math.max(0, Math.floor(Number(cart?.totalItems || 0)));
  const subtotal = Math.max(0, Number(cart?.subtotal || 0));

  if (itemCount <= 0) {
    const err = new Error('Your cart is empty');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = { reason: 'empty_cart' };
    throw err;
  }

  const weightPerItemGrams = Math.max(1, Math.floor(Number(settings?.shipping?.defaultItemWeightGrams || 250)));
  const dimsCm = settings?.shipping?.defaultItemDimsCm || { length: 25.4, width: 30.48, height: 5.08 };
  const fallbackFeeInr = Math.max(0, Math.floor(Number(settings?.shipping?.fallbackFeeInr ?? 199)));

  const { chargeableGrams } = computeShipmentGrams({
    itemCount,
    weightPerItemGrams,
  });
  const dims = dimsForDelhivery(dimsCm);

  const cacheKey = `v2|${originPin}|${destPin}|${chargeableGrams}|${dims ? `${dims.lengthCm}x${dims.breadthCm}x${dims.heightCm}` : 'nodims'}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return {
      subtotal,
      shipping: cached.shipping,
      total: Number((subtotal + cached.shipping).toFixed(2)),
      serviceable: cached.serviceable,
      pincode: destPin,
      itemCount,
      chargeableGrams: typeof cached.chargeableGrams === 'number' ? cached.chargeableGrams : chargeableGrams,
      provider: cached.provider,
      shippingBreakdown: cached.shippingBreakdown ?? null,
    };
  }

  try {
    const svc = await checkServiceability(destPin);
    const prePaidOk = isPrepaidServiceable(svc);

    if (!prePaidOk) {
      const value = {
        shipping: fallbackFeeInr,
        serviceable: false,
        provider: 'fallback',
        chargeableGrams,
        shippingBreakdown: null,
      };
      cacheSet(cacheKey, value);
      return {
        subtotal,
        shipping: fallbackFeeInr,
        total: Number((subtotal + fallbackFeeInr).toFixed(2)),
        serviceable: false,
        pincode: destPin,
        itemCount,
        chargeableGrams,
        provider: 'fallback',
        shippingBreakdown: null,
      };
    }

    const charges = await getCharges({
      originPin,
      destPin,
      weightGrams: chargeableGrams,
      paymentType: 'Pre-paid',
      codAmount: 0,
      ...(dims
        ? {
            lengthCm: dims.lengthCm,
            breadthCm: dims.breadthCm,
            heightCm: dims.heightCm,
          }
        : {}),
    });
    const row = pickChargesRow(charges);

    const amount =
      row?.total_amount ??
      row?.totalAmount ??
      row?.amount ??
      row?.charge ??
      row?.shipping_charge ??
      null;
    const shipping = amount === null ? NaN : Number(amount);
    if (!Number.isFinite(shipping) || shipping < 0) {
      throw new Error('Invalid Delhivery charges response');
    }

    const billedGrams = Math.max(1, Math.floor(Number(row?.charged_weight || chargeableGrams)));
    const shippingMoney = Number(Number(shipping).toFixed(2));
    const shippingBreakdown = delhiveryBreakdownFromRow(row);
    const value = {
      shipping: shippingMoney,
      serviceable: true,
      provider: 'delhivery',
      chargeableGrams: billedGrams,
      shippingBreakdown,
    };
    cacheSet(cacheKey, value);
    return {
      subtotal,
      shipping: shippingMoney,
      total: Number((subtotal + shippingMoney).toFixed(2)),
      serviceable: true,
      pincode: destPin,
      itemCount,
      chargeableGrams: billedGrams,
      provider: 'delhivery',
      shippingBreakdown,
    };
  } catch (err) {
    const value = {
      shipping: fallbackFeeInr,
      serviceable: true,
      provider: 'fallback',
      chargeableGrams,
      shippingBreakdown: null,
    };
    cacheSet(cacheKey, value);
    return {
      subtotal,
      shipping: fallbackFeeInr,
      total: Number((subtotal + fallbackFeeInr).toFixed(2)),
      serviceable: true,
      pincode: destPin,
      itemCount,
      chargeableGrams,
      provider: 'fallback',
      shippingBreakdown: null,
    };
  }
}

