import { Router } from 'express';
import { StoreSettings } from '../models/storeSettings.model.js';

export const settingsRouter = Router();

let cached = null;
let cachedAtMs = 0;
const CACHE_MS = 60_000;

function toPublic(doc) {
  return {
    shipping: {
      defaultFeeInr: Number(doc?.shipping?.defaultFeeInr || 0),
      freeShippingThresholdInr: Number(doc?.shipping?.freeShippingThresholdInr || 0),
      dispatchSlaDays: Number(doc?.shipping?.dispatchSlaDays || 0),
    },
  };
}

settingsRouter.get('/public', async (_req, res, next) => {
  try {
    const now = Date.now();
    if (cached && now - cachedAtMs < CACHE_MS) {
      return res.status(200).json({ success: true, data: cached });
    }

    const doc = await StoreSettings.findOne({}).lean();
    const data = toPublic(doc || {});
    cached = data;
    cachedAtMs = now;

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

