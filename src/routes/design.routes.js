import { Router } from 'express';
import * as designController from '../controllers/design.controller.js';
import { csrfProtection } from '../middleware/csrfProtection.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const designRouter = Router();

designRouter.post('/', requireAuth, csrfProtection, designController.create);

