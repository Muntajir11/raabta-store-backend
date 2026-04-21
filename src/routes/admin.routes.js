import { Router } from 'express';
import { csrfProtection } from '../middleware/csrfProtection.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { uploadProductImage } from '../lib/uploadProductImage.js';
import * as adminCustomer from '../controllers/adminCustomer.controller.js';
import * as adminProduct from '../controllers/adminProduct.controller.js';
import * as adminOrder from '../controllers/adminOrder.controller.js';
import * as adminInventory from '../controllers/adminInventory.controller.js';
import * as adminDashboard from '../controllers/adminDashboard.controller.js';
import * as adminDesign from '../controllers/adminDesign.controller.js';
import * as adminInventoryLedger from '../controllers/adminInventoryLedger.controller.js';
import * as adminSettings from '../controllers/adminSettings.controller.js';

export const adminRouter = Router();

adminRouter.use(requireAdminAuth, requireAdmin);

adminRouter.get('/dashboard', adminDashboard.get);

adminRouter.get('/settings', adminSettings.get);
adminRouter.patch('/settings', csrfProtection, adminSettings.update);

adminRouter.get('/customers', adminCustomer.list);
adminRouter.get('/customers/:userId', adminCustomer.getOne);

adminRouter.get('/orders', adminOrder.list);
adminRouter.get('/orders/:orderNumber', adminOrder.getOne);
adminRouter.patch('/orders/:orderNumber', csrfProtection, adminOrder.patch);

adminRouter.get('/inventory', adminInventory.list);
adminRouter.get('/inventory/products', adminInventoryLedger.listProducts);
adminRouter.post('/inventory/adjust', csrfProtection, adminInventoryLedger.adjust);
adminRouter.get('/inventory/history', adminInventoryLedger.history);

adminRouter.get('/designs', adminDesign.list);
adminRouter.get('/designs/:designId', adminDesign.getOne);
adminRouter.patch('/designs/:designId', csrfProtection, adminDesign.patch);

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
adminRouter.delete('/products/:productId', csrfProtection, adminProduct.remove);
