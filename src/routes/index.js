import { Router } from 'express';
import { authRouter } from './auth.routes.js';

export const apiRouter = Router();

apiRouter.post('/health', (_req, res) => {
  console.log('[health] Health check hit');
  res.json({ ok: true });
});

apiRouter.use('/auth', authRouter);
