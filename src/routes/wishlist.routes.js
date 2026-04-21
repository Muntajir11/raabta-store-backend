import { Router } from 'express';
import * as wishlistController from '../controllers/wishlist.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { csrfProtection } from '../middleware/csrfProtection.js';

export const wishlistRouter = Router();

wishlistRouter.use(requireAuth);

wishlistRouter.get('/', wishlistController.list);
wishlistRouter.post('/', csrfProtection, wishlistController.add);
wishlistRouter.delete('/:productId', csrfProtection, wishlistController.remove);

