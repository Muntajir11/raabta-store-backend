import { Router } from 'express';
import * as reviewController from '../controllers/review.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { csrfProtection } from '../middleware/csrfProtection.js';

export const reviewRouter = Router();

reviewRouter.get('/', reviewController.list);
reviewRouter.post('/', requireAuth, csrfProtection, reviewController.create);

