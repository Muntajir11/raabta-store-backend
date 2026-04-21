import { z } from 'zod';
import { User } from '../models/user.model.js';
import { Product } from '../models/product.model.js';

const bodySchema = z.object({
  productId: z.string().trim().min(1, 'productId is required').max(64),
});

function uniqStrings(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function list(req, res, next) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const user = await User.findById(userId).select('wishlist');
    const ids = uniqStrings(user?.wishlist || []);
    return res.status(200).json({ success: true, data: { items: ids } });
  } catch (err) {
    return next(err);
  }
}

export async function add(req, res, next) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }

    const productId = parsed.data.productId;
    const exists = await Product.findOne({ productId }).select('_id');
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Product not found', code: 'NOT_FOUND' });
    }

    const user = await User.findById(userId).select('wishlist');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const nextWishlist = uniqStrings([...(user.wishlist || []), productId]);
    user.wishlist = nextWishlist;
    await user.save();

    req.logMessage = `${req.authUser?.name || 'a user'} added product ${productId} to wishlist`;
    return res.status(200).json({ success: true, data: { items: nextWishlist } });
  } catch (err) {
    return next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const productId = String(req.params.productId || '').trim();
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required', code: 'VALIDATION_ERROR' });
    }

    const user = await User.findById(userId).select('wishlist');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const nextWishlist = uniqStrings((user.wishlist || []).filter((id) => id !== productId));
    user.wishlist = nextWishlist;
    await user.save();

    req.logMessage = `${req.authUser?.name || 'a user'} removed product ${productId} from wishlist`;
    return res.status(200).json({ success: true, data: { items: nextWishlist } });
  } catch (err) {
    return next(err);
  }
}

