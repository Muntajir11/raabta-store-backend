import * as adminCustomerService from '../services/adminCustomer.service.js';

export async function list(req, res, next) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const items = await adminCustomerService.listCustomersAdmin({ q });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const { userId } = req.params;
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : Number(req.query.page);
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : Number(req.query.limit);
    const data = await adminCustomerService.getCustomerDetailAdmin(userId, { page, limit });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}
