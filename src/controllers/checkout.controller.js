import { quoteShippingForUser } from '../services/shipping.service.js';

export async function quote(req, res, next) {
  try {
    const userId = req.authUser?.id;
    const data = await quoteShippingForUser(userId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

