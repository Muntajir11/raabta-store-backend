import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { apiRouter } from './src/routes/index.js';
import { errorHandler } from './src/middleware/errorHandler.js';

dotenv.config();

async function main() {
  const port = Number(process.env.PORT || 5000);
  const mongoUri = process.env.MONGODB_URI;
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
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
  console.log(`[bootstrap] Connecting to MongoDB`);
  await mongoose.connect(mongoUri);
  console.log(`[bootstrap] MongoDB connected`);

  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - started;
      console.log(`[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    });
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth', authLimiter);

  app.use('/api', apiRouter);

  app.use((_req, res) => {
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
