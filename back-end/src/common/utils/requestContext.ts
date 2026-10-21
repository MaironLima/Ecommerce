import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { pseudonymize } from './privacy.js';

interface LogContext {
  requestId: string;
  uid?: string | undefined; // pseudonymized user id
}

const storage = new AsyncLocalStorage<LogContext>();

export const getLogContext = () => storage.getStore();

// Called by auth middlewares once the token is verified: every later log line in this request carries the pseudonym.
export function setLogUser(userId: string | undefined) {
  const ctx = storage.getStore();
  if (ctx && userId) ctx.uid = pseudonymize(userId);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Gives each request an id (reusing a well-formed incoming X-Request-Id) and exposes it to the client for support.
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && UUID_RE.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId }, next);
}
