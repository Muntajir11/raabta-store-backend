import { z } from 'zod';
import { Review } from '../models/review.model.js';
import { Product } from '../models/product.model.js';

const createSchema = z.object({
  productId: z.string().trim().min(1, 'productId is required').max(120),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(4000).optional(),
});

function formatZod(error) {
  return error.issues[0]?.message || 'Validation failed';
}

export async function list(req, res, next) {
  try {
    const productId = typeof req.query.productId === 'string' ? req.query.productId.trim() : '';
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'productId is required',
        code: 'VALIDATION_ERROR',
      });
    }

    const items = await Review.find({ productId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        items: items.map((r) => ({
          id: String(r._id),
          productId: r.productId,
          userId: String(r.userId),
          rating: r.rating,
          comment: r.comment || '',
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function create(req, res, next) {
  try {
    if (!req.authUser?.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: formatZod(parsed.error),
        code: 'VALIDATION_ERROR',
      });
    }

    const { productId, rating, comment } = parsed.data;
    const productExists = await Product.findOne({ productId }).select('_id');
    if (!productExists) {
      return res.status(404).json({ success: false, message: 'Product not found', code: 'NOT_FOUND' });
    }

    const doc = await Review.findOneAndUpdate(
      { productId, userId: req.authUser.id },
      {
        $set: {
          rating,
          comment: comment || '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    req.logMessage = `${req.authUser?.name || 'a user'} reviewed product ${productId}`;

    return res.status(201).json({
      success: true,
      data: {
        review: {
          id: String(doc._id),
          productId: doc.productId,
          userId: String(doc.userId),
          rating: doc.rating,
          comment: doc.comment || '',
          createdAt: doc.createdAt,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

