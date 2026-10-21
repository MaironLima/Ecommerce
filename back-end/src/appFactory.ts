import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { FRONTEND_URL } from './config/env.js';
import logger from './common/utils/logger.js';
import { requestLogger } from './common/utils/logmiddleware.js';
import { requestContext } from './common/utils/requestContext.js';
import pingRoutes, { healthRoutes } from './modules/health/routes.js';
import authRoutes from './modules/auth/routes.js';
import userRoutes from './modules/users/routes.js';
import productsRoutes from './modules/catalog/products/routes.js';
import categoryRoutes from './modules/catalog/category/routes.js';
import { variantsRoutes } from './modules/catalog/variants/routes.js';
import cartRoutes from './modules/cart/routes.js';
import checkoutRoutes from './modules/checkout/routes.js';
import ordersRoutes from './modules/orders/routes.js';
import stripeWebhookRoutes from './modules/webhooks/stripe/routes.js';
import reviewRoutes from './modules/reviews/routes.js';
import notificationRoutes from './modules/notifications/routes.js';
import adminRoutes from './modules/admin/routes.js';

const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      logger.warn('security.rate_limited', { event: 'security.rate_limited', ip: req.ip, path: req.originalUrl.split('?')[0] });
      res.status(options.statusCode).json(options.message);
    },
  });

export function createApp(): Express {
  const app = express();
  // Behind Caddy: trust one proxy hop so req.ip (rate limits, logs) is the client, not the proxy.
  app.set('trust proxy', 1);

  // First: every log line of this request (webhook included) gets a request id.
  app.use(requestContext);
  app.use(requestLogger);

  app.use(cors({ origin: FRONTEND_URL, credentials: true }));

  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hidePoweredBy: true,
      frameguard: { action: 'deny' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.get('/uploads', (req, res) => {
    const fileSource = req.query.path as string;

    if (!fileSource) {
      return res.status(400).json({ error: 'Parameter "path" is required' });
    }

    // basename() blocks path traversal: only files directly inside imagens/uploads are served.
    const fileName = path.basename(decodeURIComponent(fileSource));
    const absolutePath = path.resolve(process.cwd(), 'imagens', 'uploads', fileName);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(absolutePath);
  });

  // Defaults are the production policy; E2E suites raise RATE_LIMIT_AUTH because they log in many times per minute.
  const authLimit = Number(process.env.RATE_LIMIT_AUTH ?? 5);
  app.use('/auth/login', limiter(60 * 1000, authLimit, 'Too many requests. Wait a minute.'));
  app.use('/auth/register', limiter(60 * 1000, authLimit, 'Too many requests. Wait a minute.'));
  app.use('/auth/recover-email', limiter(60 * 1000, 3, 'Wait a minute to a new request.'));
  app.use('/admin', limiter(60 * 1000, 120, 'Too many admin requests. Wait a minute.'));

  app.use('/ping', pingRoutes);
  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use('/products', productsRoutes);
  app.use('/product', reviewRoutes);
  app.use('/catalog/category', categoryRoutes);
  app.use('/variants', variantsRoutes);
  app.use('/cart', cartRoutes);
  app.use('/checkout', checkoutRoutes);
  app.use('/orders', ordersRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/admin', adminRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found`, code: 'NOT_FOUND' });
  });

  // Last-resort error handler (multer limits, malformed JSON, unexpected throws).
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status ?? err?.statusCode ?? (err?.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    logger.error('request.unhandled_error', { event: 'request.unhandled_error', path: req.originalUrl.split('?')[0], method: req.method, reason: err?.message, stack: err?.stack });
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
  });

  return app;
}
