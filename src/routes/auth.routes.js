import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { csrfProtection } from '../middleware/csrfProtection.js';

export const authRouter = Router();

authRouter.post('/register', csrfProtection, authController.register);
authRouter.post('/login', csrfProtection, authController.login);
authRouter.post('/refresh', csrfProtection, authController.refresh);
authRouter.post('/logout', csrfProtection, authController.logout);
authRouter.get('/session', authController.session);
