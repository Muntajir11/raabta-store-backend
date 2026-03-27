import { Router } from 'express';
import * as cartController from '../controllers/cart.controller.js';
import { csrfProtection } from '../middleware/csrfProtection.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const cartRouter = Router();

cartRouter.use(requireAuth);
cartRouter.get('/', cartController.getCart);
cartRouter.post('/items', csrfProtection, cartController.addItem);
cartRouter.patch('/items', csrfProtection, cartController.updateItemQty);
cartRouter.delete('/items', csrfProtection, cartController.removeItem);
cartRouter.delete('/', csrfProtection, cartController.clear);
cartRouter.post('/merge', csrfProtection, cartController.merge);
