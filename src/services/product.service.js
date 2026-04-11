import { Product } from '../models/product.model.js';
import { PRODUCT_SECTIONS } from '../constants/productSections.js';

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const DEFAULT_COLORS = ['Black', 'White'];

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
  };
}

export async function listProducts() {
  const products = await Product.find({ isActive: true }).sort({ createdAt: 1, productId: 1 }).lean();
  return products.map((item) => {
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
    };
  });
}

export async function getActiveProductByProductId(productId) {
  const product = await Product.findOne({ productId, isActive: true }).lean();
  if (!product) return null;
  return normalizeProduct(product);
}

function isAllowedSection(category) {
  return PRODUCT_SECTIONS.includes(String(category || '').trim());
}

/** URL clients use for images stored in MongoDB (served by GET /api/products/:productId/image). */
export function publicImageApiPath(productId) {
  return `/api/products/${encodeURIComponent(String(productId).trim())}/image`;
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
  const existing = await Product.findOne({ productId: data.productId }).lean();
  if (existing) {
    const err = new Error('Product ID already exists');
    err.statusCode = 409;
    err.code = 'PRODUCT_ID_EXISTS';
    err.details = { productId: data.productId };
    throw err;
  }

  const imageUrl =
    data.imageBuffer && data.imageMimeType
      ? publicImageApiPath(data.productId)
      : data.image;

  const doc = await Product.create({
    productId: data.productId,
    name: data.name,
    description: data.description ?? '',
    brand: data.brand ?? 'Raabta',
    rating: data.rating == null ? null : Number(data.rating),
    features: Array.isArray(data.features) ? data.features : [],
    basePrice: data.basePrice,
    image: imageUrl,
    ...(data.imageBuffer && data.imageMimeType
      ? { imageData: data.imageBuffer, imageMimeType: data.imageMimeType }
      : {}),
    category: data.category,
    sizes: data.sizes?.length ? data.sizes : DEFAULT_SIZES,
    colors: data.colors?.length ? data.colors : DEFAULT_COLORS,
    gsmOptions: data.gsmOptions?.length ? data.gsmOptions : buildDefaultGsmOptions(data.basePrice),
    isActive: data.isActive !== false,
  });
  return toAdminRow(doc);
}

/**
 * @param {string} productId
 * @param {Record<string, unknown>} data
 */
export async function updateProductAdmin(productId, data) {
  const product = await Product.findOne({ productId });
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
    product.imageData = Buffer.from(data.imageBuffer);
    product.imageMimeType = String(data.imageMimeType);
    product.image = publicImageApiPath(productId);
  } else if (data.image != null) {
    product.image = String(data.image);
    if (/^https?:\/\//i.test(product.image)) {
      product.imageMimeType = '';
      product.imageData = undefined;
    }
  }

  if (data.sizes != null) product.sizes = data.sizes;
  if (data.colors != null) product.colors = data.colors;
  if (data.gsmOptions != null) product.gsmOptions = data.gsmOptions;
  if (data.isActive != null) product.isActive = data.isActive;

  await product.save();

  if (data.image != null && /^https?:\/\//i.test(String(data.image))) {
    await Product.collection.updateOne({ _id: product._id }, { $unset: { imageData: true } });
  }

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
