import { z } from 'zod';
import * as cartService from '../services/cart.service.js';

const cartItemSchema = z.object({
  productId: z.string().trim().min(1).max(120),
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(60),
  gsm: z.number().int().refine((v) => v === 180 || v === 210 || v === 240, {
    message: 'gsm must be one of 180, 210, 240',
  }),
  qty: z.number().int().min(1).max(20),
});

const cartItemIdentitySchema = cartItemSchema.pick({
  productId: true,
  size: true,
  color: true,
  gsm: true,
});

const updateQtySchema = cartItemIdentitySchema.extend({
  qty: z.number().int().min(1).max(20),
});

const mergeSchema = z.object({
  items: z.array(cartItemSchema).max(200),
});

function readValidationError(error) {
  const first = error.issues[0];
  return first?.message || 'Validation failed';
}

export async function getCart(req, res, next) {
  try {
    const cart = await cartService.getCartByUserId(req.authUser.id);
    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
}

export async function addItem(req, res, next) {
  try {
    const parsed = cartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: readValidationError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }
    const cart = await cartService.addCartItem(req.authUser.id, parsed.data);
    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
}

export async function updateItemQty(req, res, next) {
  try {
    const parsed = updateQtySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: readValidationError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }
    const { productId, size, color, gsm, qty } = parsed.data;
    const cart = await cartService.updateCartItemQty(
      req.authUser.id,
      { productId, size, color, gsm },
      qty
    );
    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
}

export async function removeItem(req, res, next) {
  try {
    const parsed = cartItemIdentitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: readValidationError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }
    const { productId, size, color, gsm } = parsed.data;
    const cart = await cartService.removeCartItem(req.authUser.id, {
      productId,
      size,
      color,
      gsm,
    });
    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
}

export async function clear(req, res, next) {
  try {
    const cart = await cartService.clearCart(req.authUser.id);
    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
}

export async function merge(req, res, next) {
  try {
    const parsed = mergeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: readValidationError(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }
    const cart = await cartService.mergeGuestCart(req.authUser.id, parsed.data.items);
    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
}
