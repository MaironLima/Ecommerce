import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { redact } from './privacy.js';
import { getLogContext } from './requestContext.js';

export const LOG_DIR = process.env.LOG_DIR ?? path.resolve(process.cwd(), 'logs');
const isTest = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';

// Retention (LGPD art. 15/16: keep only while needed). Override with env if your policy differs.
const APP_RETENTION = process.env.LOG_RETENTION_APP ?? '90d';
// Marco Civil da Internet (Lei 12.965/2014) art. 15: application access records must be kept for 6 months.
const ACCESS_RETENTION = process.env.LOG_RETENTION_ACCESS ?? '180d';

// Adds requestId/uid from the request context to every line.
const withContext = winston.format(info => {
  const ctx = getLogContext();
  if (ctx) {
    info.requestId ??= ctx.requestId;
    if (ctx.uid) info.uid ??= ctx.uid;
  }
  return info;
});

// Every line passes through redaction: callers cannot leak credentials, e-mails, tokens or addresses by mistake.
// Redacts in place: winston keeps routing data under Symbol keys that must survive.
const redactInfo = (info: winston.Logform.TransformableInfo, keep: string[]) => {
  const fields = Object.fromEntries(Object.entries(info).filter(([k]) => !keep.includes(k)));
  return Object.assign(info, redact(fields) as object);
};

const privacy = winston.format(info => redactInfo(info, ['level', 'timestamp']));

const rotating = (name: string, maxFiles: string, level?: string) =>
  new DailyRotateFile({
    dirname: LOG_DIR,
    filename: `${name}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles,
    ...(level ? { level } : {}),
  });

const jsonFormat = winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), withContext(), privacy(), winston.format.json());

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'http',
  format: jsonFormat,
  silent: isTest && !process.env.LOG_IN_TESTS,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} ${level} ${message}${extra}`;
      })),
    }),
    ...(isTest ? [] : [rotating('app', APP_RETENTION), rotating('error', APP_RETENTION, 'error')]),
  ],
});

// Access log: kept apart because it is the only place the full IP is stored (legal obligation, LGPD art. 7 II).
// Everything else in it is still redacted. Restrict file access to operators.
export const accessLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    withContext(),
    winston.format(info => redactInfo(info, ['level', 'timestamp', 'clientIp']))(),
    winston.format.json(),
  ),
  silent: isTest,
  transports: isTest ? [new winston.transports.Console()] : [rotating('access', ACCESS_RETENTION)],
});

export default logger;
