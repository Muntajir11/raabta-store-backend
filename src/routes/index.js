import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { cartRouter } from './cart.routes.js';
import { productRouter } from './product.routes.js';

export const apiRouter = Router();

apiRouter.post('/health', (_req, res) => {
  console.log('[health] Health check hit');
  res.json({ ok: true });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/products', productRouter);
