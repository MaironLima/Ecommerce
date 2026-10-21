import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, REFRESH_SECRET } from '../config/env.js';
import { setLogUser } from '../common/utils/requestContext.js';



export function auth(req: Request, res: Response, next: NextFunction) {
  const rawAuth = req.headers.authorization;
  const accessToken = rawAuth?.startsWith('Bearer ')
    ? rawAuth.slice(7).trim()
    : rawAuth?.trim();
  const refreshToken = req.cookies?.refreshToken;

  if (!accessToken && !refreshToken) {
    return res.status(401).json({
      error: 'The tokens must be provided',
      code: 'UNAUTHENTICATED',
    });
  }
  if (!JWT_SECRET) {
    return res.status(401).json({
      error: 'Token not found',
      code: 'UNAUTHENTICATED',
    });
  }
  if (!REFRESH_SECRET) {
    return res.status(401).json({
      error: 'Token not found',
      code: 'UNAUTHENTICATED',
    });
  }

  try {
    let payload: any;
    if (accessToken) {
      payload = jwt.verify(accessToken, JWT_SECRET);
    } else {
      payload = jwt.verify(refreshToken, REFRESH_SECRET);
    }
    (req as any).user = payload;
    setLogUser(payload?.userId);
    next();
  } catch (err: any) {
    const isExpired = err?.name === 'TokenExpiredError';
    return res.status(401).json({
      error: isExpired ? 'Session expired' : 'Invalid token',
      code: isExpired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED',
    });
  }
}
