import { Router } from 'express';
import { csrfProtection } from '../middleware/csrfProtection.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { uploadProductImage } from '../lib/uploadProductImage.js';
import * as adminCustomer from '../controllers/adminCustomer.controller.js';
import * as adminProduct from '../controllers/adminProduct.controller.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/customers', adminCustomer.list);
adminRouter.get('/customers/:userId', adminCustomer.getOne);

adminRouter.get('/products', adminProduct.list);
adminRouter.get('/products/:productId', adminProduct.getOne);

function runMulterSingle(req, res, next) {
  uploadProductImage.single('image')(req, res, (err) => {
    if (err) {
      const e = new Error(err.message || 'Upload failed');
      e.statusCode = 400;
      e.code = 'UPLOAD_ERROR';
      return next(e);
    }
    next();
  });
}

function multerIfMultipart(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return runMulterSingle(req, res, next);
  }
  next();
}

adminRouter.post('/products', csrfProtection, multerIfMultipart, adminProduct.create);
adminRouter.patch('/products/:productId', csrfProtection, multerIfMultipart, adminProduct.update);
adminRouter.patch('/products/:productId/toggle-active', csrfProtection, adminProduct.toggleActive);
