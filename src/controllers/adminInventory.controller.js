import * as adminInventoryService from '../services/adminInventory.service.js';

export async function list(req, res, next) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const lowOnly = req.query.lowOnly === 'true' || req.query.lowOnly === '1';
    const items = await adminInventoryService.listInventoryAdmin({ q, lowOnly });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

