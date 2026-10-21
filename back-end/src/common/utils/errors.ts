import type { Request, Response } from 'express';
import logger from './logger.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const ERRORS = {
  UNAUTHENTICATED: {
    status: 401,
    message: 'Authentication required: invalid or missing session',
    code: 'UNAUTHENTICATED',
  },
  TOKEN_EXPIRED: {
    status: 401,
    message: 'Session expired, please login again',
    code: 'TOKEN_EXPIRED',
  },
} as const;

export function unauthenticated() {
  const e = ERRORS.UNAUTHENTICATED;
  return new HttpError(e.status, e.message, e.code);
}

export function tokenExpired() {
  const e = ERRORS.TOKEN_EXPIRED;
  return new HttpError(e.status, e.message, e.code);
}

// Shared controller helpers (were copy-pasted per module).

export function userIdOf(req: Request): string {
  const userId = (req as any).user?.userId as string | undefined;
  if (!userId) throw unauthenticated();
  return userId;
}

export function handleError(res: Response, e: any) {
  if (e instanceof HttpError) {
    const level = e.status >= 500 ? 'error' : 'warn';
    logger.log(level, 'request.failed', { event: 'request.failed', status: e.status, errorCode: e.code, reason: e.message });
    return res.status(e.status).json({ error: e.message, code: e.code });
  }
  if (e?.name === 'ZodError') {
    const issue = e.issues?.[0];
    // Only the field path and rule are logged, never the rejected value.
    logger.warn('request.invalid', { event: 'request.invalid', field: issue?.path?.join('.'), rule: issue?.code });
    return res.status(400).json({ error: issue?.message ?? 'Validation error', code: 'VALIDATION' });
  }
  logger.warn('request.failed', { event: 'request.failed', status: 400, reason: e?.message, stack: e?.stack });
  return res.status(400).json({ error: e?.message || 'Unexpected error' });
}

// Wraps an async handler so thrown errors become JSON responses.
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      handleError(res, e);
    }
  };
