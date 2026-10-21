import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../config/env.js';
import { setLogUser } from '../utils/requestContext.js';
import logger from '../utils/logger.js';

export default function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const rawAuth = req.headers.authorization;

  if (!rawAuth?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Access token must be provided',
    });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({
      error: 'JWT secret is not configured',
    });
  }

  const accessToken = rawAuth.slice(7).trim();

  if (!accessToken) {
    return res.status(401).json({
      error: 'Access token must be provided',
    });
  }

  try {
    const payload = jwt.verify(accessToken, JWT_SECRET);

    if (typeof payload === 'string') {
      return res.status(401).json({
        error: 'Invalid token',
      });
    }

    if (!payload.userId || !payload.role) {
      return res.status(401).json({
        error: 'Invalid token payload',
      });
    }

    if (!['ADMIN', 'SUPERADMIN'].includes(payload.role)) {
      setLogUser(payload.userId);
      logger.warn('security.forbidden', { event: 'security.forbidden', path: req.originalUrl, role: payload.role });
      return res.status(403).json({
        message: 'Forbidden: admin only',
      });
    }

    (req as any).user = payload;
    setLogUser(payload.userId);

    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Invalid or expired token',
    });
  }
}
