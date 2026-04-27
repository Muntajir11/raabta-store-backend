import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { apiRouter } from './src/routes/index.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import { formatHttpAccessLine } from './src/lib/requestLog.js';
import { isCloudinaryConfigured } from './src/lib/cloudinaryUpload.js';

dotenv.config();

async function main() {
  const port = Number(process.env.PORT || 5000);
  const mongoUri = process.env.MONGODB_URI;
  const corsOriginRaw =
    process.env.ADMIN_ORIGIN ||
    process.env.STOREFRONT_ORIGIN ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173,http://localhost:5174';
  const corsAllowedOrigins = corsOriginRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('change-me')) {
    throw new Error('JWT_SECRET must be set to a strong random value (32+ chars)');
  }
  if (
    !process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_REFRESH_SECRET.length < 32 ||
    process.env.JWT_REFRESH_SECRET.includes('change-me')
  ) {
    throw new Error('JWT_REFRESH_SECRET must be set to a strong random value (32+ chars)');
  }

  console.log(`[bootstrap] Starting API in ${nodeEnv} mode`);
  console.log(`[bootstrap] CORS allowed origins: ${corsAllowedOrigins.join(', ')}`);
  if (nodeEnv === 'production' && corsAllowedOrigins.length === 0) {
    throw new Error('CORS allowed origins list is empty in production');
  }
  console.log(`[bootstrap] Connecting to MongoDB`);
  await mongoose.connect(mongoUri);
  console.log(`[bootstrap] MongoDB connected`);
  if (isCloudinaryConfigured()) {
    console.log('[bootstrap] Product image uploads: Cloudinary configured');
  } else {
    console.warn(
      '[bootstrap] Product image uploads: Cloudinary not configured — admin file uploads will fail until CLOUDINARY_URL (or cloud name/key/secret) is set'
    );
  }

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "img-src": ["'self'", 'https://res.cloudinary.com', 'data:'],
          "connect-src": ["'self'"],
        },
      },
    })
  );

  // Health check should be callable by non-browser clients (no Origin header).
  // Mount it before CORS so strict CORS doesn't block it.
  app.post('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (health checks, direct navigation, server-to-server calls)
        // may omit Origin. CSRF protection still defends cookie-auth mutation routes,
        // so allow missing Origin here to avoid noisy 500s in production.
        if (!origin) {
          return callback(null, true);
        }
        if (corsAllowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        // Don't throw: if origin is not allowed, omit CORS headers and let the browser block.
        return callback(null, false);
      },
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '500kb' }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - started;
      const line = formatHttpAccessLine(req, res.statusCode, ms);
      if (line) console.log(line);
    });
    next();
  });

  // In production, add a light auth rate limit to reduce brute-force attempts.
  // In development/testing, do not rate-limit auth endpoints (it breaks UX and automation).
  if (nodeEnv === 'production') {
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use('/api/auth', authLimiter);
    app.use('/api/admin/auth', authLimiter);
  }

  app.use('/api', apiRouter);

  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });

  app.use(errorHandler);

  const server = app.listen(port, () => {
    console.log(`[bootstrap] Server listening on port ${port}`);
  });

  const shutdown = async (signal) => {
    console.log(`[shutdown] ${signal} received, closing server`);
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('[shutdown] HTTP server closed');
    await mongoose.disconnect();
    console.log('[shutdown] MongoDB disconnected');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[fatal] Failed to start server:', err);
  process.exit(1);
});
