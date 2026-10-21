// Starts the API against a freshly seeded test database for Playwright (E2E/smoke) and load tests.
// No real e-mail or payment: SMTP and Stripe keys are blanked.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { prepareTestDb } from './test-db.js';

// Test runs write their logs to a throwaway folder, never next to the developer's logs.
const logDir = path.join(os.tmpdir(), 'ecommerce-e2e-logs');
fs.rmSync(logDir, { recursive: true, force: true });

const url = await prepareTestDb({ seed: true });

Object.assign(process.env, {
  DATABASE_URL: url,
  PORT: process.env.E2E_API_PORT ?? '3100',
  FRONTEND_URL: process.env.E2E_WEB_URL ?? 'http://localhost:5174',
  RATE_LIMIT_AUTH: process.env.RATE_LIMIT_AUTH ?? '1000',
  MAIL_USER: '',
  MAIL_PASSWORD: '',
  STRIPE_SECRET_KEY: '',
  LOG_DIR: logDir,
});

await import('../../src/app.js');
