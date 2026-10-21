// Runs in each worker before the test file imports the app: point Prisma/pg at the test DB
// and make sure no real e-mail or payment is ever sent from tests.
import os from 'os';
import path from 'path';
import { testDatabaseUrl } from '../support/test-db.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.MAIL_USER = '';
process.env.MAIL_PASSWORD = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.JWT_SECRET ||= 'integration-jwt-secret';
process.env.REFRESH_SECRET ||= 'integration-refresh-secret';
process.env.RATE_LIMIT_AUTH = '1000';
process.env.LOG_DIR = path.join(os.tmpdir(), `ecommerce-int-logs-${process.pid}`);
