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
