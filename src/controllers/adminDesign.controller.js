import * as adminDesignService from '../services/adminDesign.service.js';

export async function list(req, res, next) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 30;
    const data = await adminDesignService.listDesignsAdmin({ q, status, page, limit });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const data = await adminDesignService.getDesignAdmin(req.params.designId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

export async function patch(req, res, next) {
  try {
    const parsed = adminDesignService.designPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message ?? 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }
    const data = await adminDesignService.patchDesignAdmin(req.params.designId, parsed.data);
    req.logMessage = `${req.authUser?.name || 'Admin'} updated design ${req.params.designId}`;
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

