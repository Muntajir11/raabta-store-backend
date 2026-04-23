import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { csrfProtection } from '../middleware/csrfProtection.js';
import * as checkout from '../controllers/checkout.controller.js';

export const checkoutRouter = Router();

checkoutRouter.post('/quote', requireAuth, csrfProtection, checkout.quote);
checkoutRouter.post('/place', requireAuth, csrfProtection, checkout.place);

