import { Router } from 'express';
import { adminRouter } from './admin.routes.js';
import { authRouter } from './auth.routes.js';
import { cartRouter } from './cart.routes.js';
import { productRouter } from './product.routes.js';
import { wishlistRouter } from './wishlist.routes.js';
import { reviewRouter } from './review.routes.js';
import { meRouter } from './me.routes.js';
import { adminAuthRouter } from './adminAuth.routes.js';
import { designRouter } from './design.routes.js';
import { settingsRouter } from './settings.routes.js';
import { checkoutRouter } from './checkout.routes.js';

export const apiRouter = Router();

apiRouter.post('/health', (_req, res) => {
  console.log('[health] Health check hit');
  res.json({ ok: true });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin/auth', adminAuthRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/designs', designRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/reviews', reviewRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/checkout', checkoutRouter);
