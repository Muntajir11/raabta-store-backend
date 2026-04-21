import { Router } from 'express';
import * as adminAuthController from '../controllers/adminAuth.controller.js';
import { csrfProtection } from '../middleware/csrfProtection.js';

export const adminAuthRouter = Router();

adminAuthRouter.post('/login', csrfProtection, adminAuthController.login);
adminAuthRouter.post('/refresh', csrfProtection, adminAuthController.refresh);
adminAuthRouter.post('/logout', csrfProtection, adminAuthController.logout);
adminAuthRouter.get('/session', adminAuthController.session);

