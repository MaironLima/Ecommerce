import { Request, Response, NextFunction } from 'express';
import logger, { accessLogger } from './logger.js';
import { maskIp } from './privacy.js';

// Logs every HTTP request once it finishes. Query values and bodies are never logged (data minimization);
// only the query keys, to help debugging without storing what the user typed.
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const path = req.originalUrl.split('?')[0];
    const queryKeys = Object.keys(req.query ?? {});
    const entry = {
      event: 'http.request',
      method: req.method,
      path,
      ...(queryKeys.length ? { queryKeys } : {}),
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
    };

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
    logger.log(level, `${req.method} ${path} ${res.statusCode}`, { ...entry, ip: maskIp(req.ip) });
    accessLogger.info('access', { ...entry, clientIp: req.ip });
  });

  next();
}
