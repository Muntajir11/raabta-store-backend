import { Router } from 'express';
import * as meController from '../controllers/me.controller.js';
import { csrfProtection } from '../middleware/csrfProtection.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get('/', meController.getMe);
meRouter.patch('/', csrfProtection, meController.patchMe);
meRouter.patch('/password', csrfProtection, meController.patchPassword);
meRouter.get('/orders', meController.listOrders);
meRouter.get('/orders/:orderNumber', meController.getOrder);
meRouter.post('/orders/:orderNumber/cancel', csrfProtection, meController.cancelOrder);
