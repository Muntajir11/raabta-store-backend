import * as adminOrderService from '../services/adminOrder.service.js';

export async function list(req, res, next) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const paymentStatus = typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : '';
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 30;
    const data = await adminOrderService.listOrdersAdmin({ q, status, paymentStatus, page, limit });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const orderNumber = req.params.orderNumber;
    const data = await adminOrderService.getOrderAdmin(orderNumber);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

export async function patch(req, res, next) {
  try {
    const orderNumber = req.params.orderNumber;
    const parsed = adminOrderService.orderPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message ?? 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }

    const data = await adminOrderService.patchOrderAdmin(orderNumber, parsed.data, { userId: req.authUser?.id });
    req.logMessage = `${req.authUser?.name || 'Admin'} updated order ${orderNumber}`;
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

