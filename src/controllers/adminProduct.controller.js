import { z } from 'zod';
import * as productService from '../services/product.service.js';
import { PRODUCT_SECTIONS } from '../constants/productSections.js';
import { assertMinImageDimensions } from '../lib/validateImageDimensions.js';

const gsmOptionSchema = z.object({
  gsm: z.coerce
    .number()
    .refine((n) => n === 180 || n === 210 || n === 240, { message: 'gsm must be 180, 210, or 240' }),
  price: z.coerce.number().min(0),
  isActive: z.boolean().optional(),
});

const inventoryRowSchema = z.object({
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(40),
  gsm: z.coerce.number().refine((n) => n === 180 || n === 210 || n === 240, { message: 'gsm must be 180, 210, or 240' }),
  qty: z.coerce.number().int().min(0),
});

const categorySchema = z
  .string()
  .trim()
  .refine((s) => PRODUCT_SECTIONS.includes(s), { message: 'Invalid category' });

const ratingOptionalSchema = z.preprocess((v) => {
  if (v === '' || v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}, z.union([z.number().min(0).max(5), z.null()]).optional());

const jsonBodySchema = z.object({
  productId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  category: categorySchema,
  basePrice: z.coerce.number().min(0),
  image: z.string().trim().min(1).max(2048),
  description: z.string().max(20000).optional().default(''),
  brand: z.string().trim().max(120).optional().default('Raabta'),
  rating: ratingOptionalSchema,
  features: z.array(z.string()).optional().default([]),
  sizes: z.array(z.string().trim().min(1)).optional(),
  colors: z.array(z.string().trim().min(1)).optional(),
  gsmOptions: z.array(gsmOptionSchema).optional(),
  inventory: z.array(inventoryRowSchema).optional(),
  isActive: z
    .preprocess((v) => {
      if (v === undefined || v === '') return true;
      if (v === false || v === 'false') return false;
      return true;
    }, z.boolean())
    .optional()
    .default(true),
});

/** POST create — server assigns productId; body must not include productId */
const createJsonSchema = jsonBodySchema.omit({ productId: true });

const patchJsonSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    category: categorySchema.optional(),
    basePrice: z.coerce.number().min(0).optional(),
    image: z.string().trim().min(1).max(2048).optional(),
    description: z.string().max(20000).optional(),
    brand: z.string().trim().max(120).optional(),
    rating: ratingOptionalSchema,
    features: z.array(z.string()).optional(),
    sizes: z.array(z.string().trim().min(1)).optional(),
    colors: z.array(z.string().trim().min(1)).optional(),
    gsmOptions: z.array(gsmOptionSchema).optional(),
    inventory: z.array(inventoryRowSchema).optional(),
    isActive: z
      .preprocess((v) => {
        if (v === undefined) return undefined;
        if (v === true || v === 'true') return true;
        if (v === false || v === 'false') return false;
        return undefined;
      }, z.boolean().optional()),
  });

function splitCommaList(s) {
  if (!s || typeof s !== 'string') return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitLines(s) {
  if (!s || typeof s !== 'string') return [];
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseGsmOptionsJson(raw) {
  if (raw == null || raw === '') return undefined;
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const parsed = JSON.parse(str);
  return z.array(gsmOptionSchema).parse(parsed);
}

function parseInventoryJson(raw) {
  if (raw == null || raw === '') return undefined;
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const parsed = JSON.parse(str);
  return z.array(inventoryRowSchema).parse(parsed);
}

/**
 * Merge multipart fields + optional file into payload for create/update.
 */
function parseMultipartProductBody(req, { requireImage }) {
  const b = req.body || {};
  const imageUrl = typeof b.imageUrl === 'string' && b.imageUrl.trim() ? b.imageUrl.trim() : null;
  const image = imageUrl;
  if (requireImage && !image && !req.file) {
    const err = new Error('Image is required (file upload or imageUrl)');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  let sizes;
  if (b.sizesJson) {
    sizes = JSON.parse(String(b.sizesJson));
  } else if (b.sizes) {
    sizes = splitCommaList(String(b.sizes));
  }

  let colors;
  if (b.colorsJson) {
    colors = JSON.parse(String(b.colorsJson));
  } else if (b.colors) {
    colors = splitCommaList(String(b.colors));
  }

  let features;
  if (b.featuresJson) {
    features = JSON.parse(String(b.featuresJson));
  } else if (b.features != null) {
    features = splitLines(String(b.features));
  }

  let gsmOptions;
  if (b.gsmOptionsJson) {
    gsmOptions = parseGsmOptionsJson(b.gsmOptionsJson);
  }

  let inventory;
  if (b.inventoryJson) {
    inventory = parseInventoryJson(b.inventoryJson);
  }

  const basePrice = b.basePrice != null ? Number(b.basePrice) : NaN;
  const ratingRaw = b.rating;
  let rating;
  if (ratingRaw === '' || ratingRaw == null) {
    rating = undefined;
  } else {
    const n = Number(ratingRaw);
    rating = Number.isFinite(n) ? n : null;
  }

  const payload = {
    productId: b.productId != null ? String(b.productId).trim() : undefined,
    name: b.name != null ? String(b.name).trim() : undefined,
    category: b.category != null ? String(b.category).trim() : undefined,
    basePrice: Number.isFinite(basePrice) ? basePrice : undefined,
    image: image || undefined,
    description: b.description != null ? String(b.description) : '',
    brand: b.brand != null && String(b.brand).trim() ? String(b.brand).trim() : 'Raabta',
    rating,
    features: features ?? [],
    sizes,
    colors,
    gsmOptions,
    inventory,
    isActive: b.isActive === undefined ? true : String(b.isActive) !== 'false',
  };

  return payload;
}

export async function list(req, res, next) {
  try {
    const section = typeof req.query.section === 'string' ? req.query.section : '';
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const items = await productService.listProductsAdmin({
      section: section.trim() || undefined,
      q: q.trim() || undefined,
    });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const { productId } = req.params;
    const row = await productService.getProductByProductIdAdmin(productId);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Not found', code: 'PRODUCT_NOT_FOUND' });
    }
    return res.status(200).json({ success: true, data: row });
  } catch (err) {
    return next(err);
  }
}

export async function create(req, res, next) {
  try {
    const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
    let data;
    if (isMultipart) {
      const raw = parseMultipartProductBody(req, { requireImage: true });
      delete raw.productId;
      if (req.file) {
        assertMinImageDimensions(req.file.buffer, { minWidth: 640, minHeight: 800 });
        const parsed = createJsonSchema.parse({
          ...raw,
          image: raw.image?.trim() || 'https://placeholder.invalid/pending-product-image',
        });
        data = {
          ...parsed,
          imageBuffer: req.file.buffer,
          imageMimeType: req.file.mimetype,
        };
      } else {
        data = createJsonSchema.parse({
          ...raw,
          image: raw.image,
        });
      }
    } else {
      const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
      delete body.productId;
      data = createJsonSchema.parse(body);
    }
    const created = await productService.createProductAdmin(data);
    console.log(`[admin] product created productId=${created.productId}`);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: err.issues[0]?.message || 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { productId } = req.params;
    const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
    let patch;
    if (isMultipart) {
      const raw = parseMultipartProductBody(req, { requireImage: false });
      const entries = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== undefined)
      );
      patch = patchJsonSchema.parse(entries);
      if (req.file) {
        assertMinImageDimensions(req.file.buffer, { minWidth: 640, minHeight: 800 });
        patch = {
          ...patch,
          imageBuffer: req.file.buffer,
          imageMimeType: req.file.mimetype,
        };
      }
    } else {
      patch = patchJsonSchema.parse(req.body);
    }
    const updated = await productService.updateProductAdmin(productId, patch);
    console.log(`[admin] product updated productId=${productId}`);
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: err.issues[0]?.message || 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }
    return next(err);
  }
}

export async function toggleActive(req, res, next) {
  try {
    const { productId } = req.params;
    const updated = await productService.toggleProductActiveAdmin(productId);
    console.log(
      `[admin] product toggle active productId=${productId} isActive=${updated.isActive}`
    );
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const { productId } = req.params;
    await productService.deleteProductAdmin(productId);
    console.log(`[admin] product deleted productId=${productId}`);
    return res.status(200).json({ success: true, data: { productId } });
  } catch (err) {
    return next(err);
  }
}
