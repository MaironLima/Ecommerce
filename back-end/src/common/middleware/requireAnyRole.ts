import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

export default function requireAnyRole(role: string[]) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (!req.user || !role.includes(req.user.role)) {
      logger.warn('security.forbidden', { event: 'security.forbidden', path: req.originalUrl, role: req.user?.role, required: role });
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
}