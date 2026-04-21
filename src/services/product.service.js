import {
  destroyProductImage,
  uploadProductImageBuffer,
} from '../lib/cloudinaryUpload.js';
import { Cart } from '../models/cart.model.js';
import { Counter } from '../models/counter.model.js';
import { Product } from '../models/product.model.js';
import { PRODUCT_SECTIONS } from '../constants/productSections.js';
import { computeEffectiveInventoryForProducts } from './inventoryLedger.service.js';

const PRODUCT_CODE_COUNTER_ID = 'productCode';

/**
 * Max numeric-only productId in the catalog (for bootstrapping the counter).
 */
async function getMaxNumericProductId() {
  const rows = await Product.find({
    productId: { $regex: /^\d+$/ },
  })
    .select('productId')
    .lean();
  let max = 0;
  for (const row of rows) {
    const n = parseInt(String(row.productId), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Next unique numeric string product id (single atomic update; safe under concurrency).
 */
export async function getNextProductCode() {
  const exists = await Counter.exists({ _id: PRODUCT_CODE_COUNTER_ID });
  const boot = exists ? 0 : await getMaxNumericProductId();
  const updated = await Counter.findOneAndUpdate(
    { _id: PRODUCT_CODE_COUNTER_ID },
    [
      {
        $set: {
          seq: {
            $add: [{ $ifNull: ['$seq', boot] }, 1],
          },
        },
      },
    ],
    { upsert: true, new: true }
  ).lean();
  if (!updated || typeof updated.seq !== 'number') {
    const err = new Error('Failed to allocate product code');
    err.statusCode = 503;
    err.code = 'PRODUCT_CODE_ALLOCATION_FAILED';
    throw err;
  }
  return String(updated.seq);
}

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const DEFAULT_COLORS = ['Black', 'White'];

function uniqNormalized(list, norm) {
  const out = [];
  const seen = new Set();
  for (const v of list) {
    const raw = String(v ?? '').trim();
    if (!raw) continue;
    const key = norm(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

function deriveSizesColorsFromInventory(inventory) {
  const inv = Array.isArray(inventory) ? inventory : [];
  if (inv.length === 0) return null;
  const sizes = uniqNormalized(inv.map((r) => r?.size), (s) => String(s).trim().toUpperCase());
  const colors = uniqNormalized(inv.map((r) => r?.color), (s) => String(s).trim().toLowerCase());
  return { sizes, colors };
}

function buildDefaultGsmOptions(basePrice) {
  return [
    { gsm: 180, price: Number(basePrice.toFixed(2)), isActive: true },
    { gsm: 210, price: Number((basePrice + 3).toFixed(2)), isActive: true },
    { gsm: 240, price: Number((basePrice + 6).toFixed(2)), isActive: true },
  ];
}

function normalizeProduct(raw) {
  const basePrice =
    typeof raw.basePrice === 'number'
      ? raw.basePrice
      : typeof raw.price === 'number'
        ? raw.price
        : 0;

  const sizes = Array.isArray(raw.sizes) && raw.sizes.length > 0 ? raw.sizes : DEFAULT_SIZES;
  const colors = Array.isArray(raw.colors) && raw.colors.length > 0 ? raw.colors : DEFAULT_COLORS;
  const gsmOptions =
    Array.isArray(raw.gsmOptions) && raw.gsmOptions.length > 0
      ? raw.gsmOptions
      : buildDefaultGsmOptions(basePrice);

  const activeGsmOptions = gsmOptions.filter((opt) => opt && opt.isActive !== false);
  const inventory = Array.isArray(raw.inventory) ? raw.inventory : [];
  return {
    productId: raw.productId,
    name: raw.name,
    category: raw.category,
    image: raw.image,
    isActive: raw.isActive !== false,
    basePrice,
    sizes,
    colors,
    gsmOptions: activeGsmOptions,
    inventory,
  };
}

export async function listProducts() {
  const products = await Product.find({ isActive: true }).sort({ createdAt: 1, productId: 1 }).lean();
  const withEffective = await computeEffectiveInventoryForProducts(products);
  return withEffective.map((item) => {
    const normalized = normalizeProduct(item);
    const minPrice =
      normalized.gsmOptions.length > 0
        ? Math.min(...normalized.gsmOptions.map((opt) => opt.price))
        : normalized.basePrice;
    return {
      id: normalized.productId,
      name: normalized.name,
      price: minPrice,
      image: normalized.image,
      category: normalized.category,
      sizes: normalized.sizes,
      colors: normalized.colors,
      gsmOptions: normalized.gsmOptions.map((opt) => ({
        gsm: opt.gsm,
        price: opt.price,
      })),
      inventory: (normalized.inventory || []).map((row) => ({
        size: row.size,
        color: row.color,
        gsm: row.gsm,
        qty: row.qty,
        baseQty: row.baseQty,
        adjustmentsQty: row.adjustmentsQty,
        effectiveQty: row.effectiveQty,
        reorderPoint: row.reorderPoint,
      })),
    };
  });
}

export async function getActiveProductByProductId(productId) {
  const product = await Product.findOne({ productId, isActive: true }).lean();
  if (!product) return null;
  const [withEffective] = await computeEffectiveInventoryForProducts([product]);
  return normalizeProduct(withEffective);
}

function isAllowedSection(category) {
  return PRODUCT_SECTIONS.includes(String(category || '').trim());
}

function toAdminRow(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    productId: o.productId,
    name: o.name,
    description: o.description ?? '',
    brand: o.brand ?? 'Raabta',
    rating: o.rating ?? null,
    features: Array.isArray(o.features) ? o.features : [],
    basePrice: o.basePrice,
    image: o.image,
    category: o.category,
    sizes: o.sizes?.length ? o.sizes : DEFAULT_SIZES,
    colors: o.colors?.length ? o.colors : DEFAULT_COLORS,
    gsmOptions: Array.isArray(o.gsmOptions) && o.gsmOptions.length > 0 ? o.gsmOptions : buildDefaultGsmOptions(o.basePrice),
    inventory: Array.isArray(o.inventory) ? o.inventory : [],
    isActive: o.isActive !== false,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/**
 * @param {{ section?: string; q?: string }} filters
 */
export async function listProductsAdmin(filters = {}) {
  const query = {};
  if (filters.section && String(filters.section).trim()) {
    query.category = String(filters.section).trim();
  }
  if (filters.q && String(filters.q).trim()) {
    const rx = new RegExp(String(filters.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ productId: rx }, { name: rx }, { category: rx }];
  }
  const products = await Product.find(query).sort({ createdAt: -1, productId: 1 }).lean();
  return products.map((p) => toAdminRow(p));
}

export async function getProductByProductIdAdmin(productId) {
  const product = await Product.findOne({ productId }).lean();
  return toAdminRow(product);
}

/**
 * @param {Record<string, unknown>} data
 */
export async function createProductAdmin(data) {
  if (!isAllowedSection(data.category)) {
    const err = new Error(`Invalid category; must be one of: ${PRODUCT_SECTIONS.join(', ')}`);
    err.statusCode = 400;
    err.code = 'INVALID_CATEGORY';
    err.details = { category: data.category, allowed: PRODUCT_SECTIONS };
    throw err;
  }

  const productId = await getNextProductCode();

  let imageUrl =
    typeof data.image === 'string' && data.image.trim() ? data.image.trim() : '';
  let imageCloudinaryPublicId = '';

  if (data.imageBuffer && data.imageMimeType) {
    const { secureUrl, publicId } = await uploadProductImageBuffer(
      Buffer.from(data.imageBuffer),
      {
        productId,
        mimeType: String(data.imageMimeType),
      }
    );
    imageUrl = secureUrl;
    imageCloudinaryPublicId = publicId;
  }

  if (!imageUrl) {
    const err = new Error('Image is required (file upload or image URL)');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const derived = deriveSizesColorsFromInventory(data.inventory);
  const doc = await Product.create({
    productId,
    name: data.name,
    description: data.description ?? '',
    brand: data.brand ?? 'Raabta',
    rating: data.rating == null ? null : Number(data.rating),
    features: Array.isArray(data.features) ? data.features : [],
    basePrice: data.basePrice,
    image: imageUrl,
    ...(imageCloudinaryPublicId ? { imageCloudinaryPublicId } : {}),
    category: data.category,
    sizes: derived?.sizes?.length ? derived.sizes : (data.sizes?.length ? data.sizes : DEFAULT_SIZES),
    colors: derived?.colors?.length ? derived.colors : (data.colors?.length ? data.colors : DEFAULT_COLORS),
    gsmOptions: data.gsmOptions?.length ? data.gsmOptions : buildDefaultGsmOptions(data.basePrice),
    ...(Array.isArray(data.inventory) ? { inventory: data.inventory } : {}),
    isActive: data.isActive !== false,
  });
  return toAdminRow(doc);
}

/**
 * @param {string} productId
 * @param {Record<string, unknown>} data
 */
export async function updateProductAdmin(productId, data) {
  const product = await Product.findOne({ productId }).select('+imageCloudinaryPublicId');
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    err.code = 'PRODUCT_NOT_FOUND';
    err.details = { productId };
    throw err;
  }

  if (data.category != null) {
    if (!isAllowedSection(data.category)) {
      const err = new Error(`Invalid category; must be one of: ${PRODUCT_SECTIONS.join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_CATEGORY';
      throw err;
    }
    product.category = data.category;
  }
  if (data.name != null) product.name = data.name;
  if (data.description != null) product.description = data.description;
  if (data.brand != null) product.brand = data.brand;
  if (data.rating !== undefined) product.rating = data.rating == null ? null : Number(data.rating);
  if (data.features != null) product.features = Array.isArray(data.features) ? data.features : [];
  if (data.basePrice != null) product.basePrice = data.basePrice;

  if (data.imageBuffer && data.imageMimeType) {
    const { secureUrl, publicId } = await uploadProductImageBuffer(
      Buffer.from(data.imageBuffer),
      {
        productId,
        mimeType: String(data.imageMimeType),
      }
    );
    product.image = secureUrl;
    product.imageCloudinaryPublicId = publicId;
  } else if (data.image != null) {
    const next = String(data.image).trim();
    const prev = String(product.image).trim();
    if (next !== prev && product.imageCloudinaryPublicId) {
      await destroyProductImage(product.imageCloudinaryPublicId);
      product.imageCloudinaryPublicId = '';
    }
    product.image = next;
  }

  if (data.sizes != null) product.sizes = data.sizes;
  if (data.colors != null) product.colors = data.colors;
  if (data.gsmOptions != null) product.gsmOptions = data.gsmOptions;
  if (data.inventory != null) product.inventory = data.inventory;
  if (data.isActive != null) product.isActive = data.isActive;

  if (data.inventory != null) {
    const derived = deriveSizesColorsFromInventory(data.inventory);
    if (derived?.sizes?.length) product.sizes = derived.sizes;
    if (derived?.colors?.length) product.colors = derived.colors;
  }

  await product.save();

  const fresh = await Product.findOne({ productId });
  return toAdminRow(fresh);
}

export async function toggleProductActiveAdmin(productId) {
  const product = await Product.findOne({ productId });
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    err.code = 'PRODUCT_NOT_FOUND';
    err.details = { productId };
    throw err;
  }
  product.isActive = !product.isActive;
  await product.save();
  return toAdminRow(product);
}

/**
 * Permanently remove a product and its Cloudinary asset; strip from open carts.
 * @param {string} productId
 */
export async function deleteProductAdmin(productId) {
  const product = await Product.findOne({ productId }).select('+imageCloudinaryPublicId');
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    err.code = 'PRODUCT_NOT_FOUND';
    err.details = { productId };
    throw err;
  }
  const publicId = product.imageCloudinaryPublicId;
  if (publicId && String(publicId).trim()) {
    try {
      await destroyProductImage(String(publicId).trim());
    } catch (err) {
      console.warn(
        `[admin] product delete: image cleanup failed productId=${productId}`,
        err?.message || err
      );
    }
  }
  await Cart.updateMany({ 'items.productId': productId }, { $pull: { items: { productId } } });
  await Product.deleteOne({ productId });
}
