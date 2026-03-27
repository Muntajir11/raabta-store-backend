import { Product } from '../models/product.model.js';

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
