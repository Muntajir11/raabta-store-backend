import { Product } from '../models/product.model.js';
import * as productService from '../services/product.service.js';

export async function list(req, res, next) {
  try {
    const products = await productService.listProducts();
    return res.status(200).json({
      success: true,
      data: { items: products },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Serve product image bytes stored on the document (public; used by storefront img src).
 */
export async function getImage(req, res, next) {
  try {
    const { productId } = req.params;
    const p = await Product.findOne({ productId }).select('+imageData imageMimeType').lean();
    if (!p?.imageData) {
      return res.status(404).end();
    }
    const raw = p.imageData;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (!buf.length) {
      return res.status(404).end();
    }
    res.setHeader('Content-Type', p.imageMimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buf);
  } catch (err) {
    return next(err);
  }
}
