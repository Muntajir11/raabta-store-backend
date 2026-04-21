import * as adminDashboardService from '../services/adminDashboard.service.js';

export async function get(req, res, next) {
  try {
    const data = await adminDashboardService.getDashboardAdmin();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

