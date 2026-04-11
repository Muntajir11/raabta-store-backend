import { Cart } from '../models/cart.model.js';
import { getActiveProductByProductId } from './product.service.js';

function toCartResponse(doc) {
  return {
    items: doc.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      category: item.category,
      size: item.size,
      color: item.color,
      gsm: item.gsm,
      qty: item.qty,
      lineTotal: Number((item.price * item.qty).toFixed(2)),
    })),
    totalItems: doc.items.reduce((sum, item) => sum + item.qty, 0),
    subtotal: Number(doc.items.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2)),
  };
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }
  return cart;
}

function resolveVariant(catalogProduct, selection) {
  const size = String(selection.size || '').trim().toUpperCase();
  const color = String(selection.color || '').trim().toLowerCase();
  const gsm = Number(selection.gsm);

  const allowedSizes = (catalogProduct.sizes || []).map((v) => String(v).trim().toUpperCase());
  const allowedColors = (catalogProduct.colors || []).map((v) => String(v).trim().toLowerCase());

  if (!allowedSizes.includes(size)) {
    const err = new Error('Invalid size for product');
    err.statusCode = 400;
    err.code = 'INVALID_SIZE';
    err.details = { productId: catalogProduct.productId, size, allowedSizes };
    throw err;
  }
  if (!allowedColors.includes(color)) {
    const err = new Error('Invalid color for product');
    err.statusCode = 400;
    err.code = 'INVALID_COLOR';
    err.details = { productId: catalogProduct.productId, color, allowedColors };
    throw err;
  }

  const gsmOption = (catalogProduct.gsmOptions || []).find((opt) => Number(opt.gsm) === gsm);
  if (!gsmOption) {
    const err = new Error('Invalid GSM for product');
    err.statusCode = 400;
    err.code = 'INVALID_GSM';
    err.details = {
      productId: catalogProduct.productId,
      gsm,
      availableGsm: (catalogProduct.gsmOptions || []).map((o) => o.gsm),
    };
    throw err;
  }

  return {
    size,
    color: color.charAt(0).toUpperCase() + color.slice(1),
    gsm,
    price: gsmOption.price,
  };
}

function mergeItemIntoItems(items, catalogProduct, selection, qty) {
  const idx = items.findIndex(
    (item) =>
      item.productId === catalogProduct.productId &&
      String(item.size).toUpperCase() === selection.size &&
      String(item.color).toLowerCase() === String(selection.color).toLowerCase() &&
      Number(item.gsm) === selection.gsm
  );
  if (idx === -1) {
    items.push({
      productId: catalogProduct.productId,
      name: catalogProduct.name,
      price: selection.price,
      image: catalogProduct.image,
      category: catalogProduct.category,
      size: selection.size,
      color: selection.color,
      gsm: selection.gsm,
      qty: Math.min(qty, 20),
    });
    return;
  }
  const current = items[idx];
  current.qty = Math.min(current.qty + qty, 20);
  // Keep display snapshots updated with latest item metadata.
  current.name = catalogProduct.name;
  current.price = selection.price;
  current.image = catalogProduct.image;
  current.category = catalogProduct.category;
  current.size = selection.size;
  current.color = selection.color;
  current.gsm = selection.gsm;
}

function normalizeSelection(selection) {
  return {
    productId: String(selection.productId || '').trim(),
    size: String(selection.size || '')
      .trim()
      .toUpperCase(),
    color: String(selection.color || '')
      .trim()
      .toLowerCase(),
    gsm: Number(selection.gsm),
  };
}

function matchesLineItem(item, selection) {
  const normalized = normalizeSelection(selection);
  return (
    item.productId === normalized.productId &&
    String(item.size || '').trim().toUpperCase() === normalized.size &&
    String(item.color || '').trim().toLowerCase() === normalized.color &&
    Number(item.gsm) === normalized.gsm
  );
}

export async function getCartByUserId(userId) {
  const cart = await getOrCreateCart(userId);
  return toCartResponse(cart);
}

export async function addCartItem(userId, input) {
  const catalogProduct = await getActiveProductByProductId(input.productId);
  if (!catalogProduct) {
    const err = new Error('Product not found or inactive');
    err.statusCode = 404;
    err.code = 'PRODUCT_NOT_FOUND';
    err.details = { productId: input.productId, context: 'addCartItem' };
    throw err;
  }

  const variant = resolveVariant(catalogProduct, input);
  const cart = await getOrCreateCart(userId);
  mergeItemIntoItems(cart.items, catalogProduct, variant, input.qty);
  await cart.save();
  return toCartResponse(cart);
}

export async function updateCartItemQty(userId, selection, qty) {
  const cart = await getOrCreateCart(userId);
  const target = cart.items.find((item) => matchesLineItem(item, selection));
  if (!target) {
    const err = new Error('Cart item not found');
    err.statusCode = 404;
    err.code = 'CART_ITEM_NOT_FOUND';
    err.details = {
      userId,
      line: normalizeSelection(selection),
      context: 'updateCartItemQty',
    };
    throw err;
  }
  target.qty = qty;
  await cart.save();
  return toCartResponse(cart);
}

export async function removeCartItem(userId, selection) {
  const cart = await getOrCreateCart(userId);
  const next = cart.items.filter((item) => !matchesLineItem(item, selection));
  cart.items = next;
  await cart.save();
  return toCartResponse(cart);
}

export async function clearCart(userId) {
  const cart = await getOrCreateCart(userId);
  cart.items = [];
  await cart.save();
  return toCartResponse(cart);
}

export async function mergeGuestCart(userId, guestItems) {
  const cart = await getOrCreateCart(userId);
  for (const incoming of guestItems) {
    const catalogProduct = await getActiveProductByProductId(incoming.productId);
    if (!catalogProduct) continue;
    const variant = resolveVariant(catalogProduct, incoming);
    mergeItemIntoItems(cart.items, catalogProduct, variant, incoming.qty);
  }
  await cart.save();
  return toCartResponse(cart);
}
