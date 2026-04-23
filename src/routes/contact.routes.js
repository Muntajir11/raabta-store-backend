import { Router } from 'express';
import * as contactController from '../controllers/contact.controller.js';

export const contactRouter = Router();

contactRouter.post('/', contactController.create);

