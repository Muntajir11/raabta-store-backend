import * as adminSettingsService from '../services/adminSettings.service.js';

export async function get(_req, res, next) {
  try {
    const data = await adminSettingsService.getStoreSettings();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const parsed = adminSettingsService.storeSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message ?? 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }

    const data = await adminSettingsService.updateStoreSettings(parsed.data);
    req.logMessage = `${req.authUser?.name || 'Admin'} updated store settings`;
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

