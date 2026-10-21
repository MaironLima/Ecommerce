import { PORT } from './config/env.js';
import { startCronJobs } from './jobs/cron.js';
import { createApp } from './appFactory.js';
import logger from './common/utils/logger.js';

const app = createApp();

app.listen(PORT, () => {
  logger.info('server.started', { event: 'server.started', port: PORT, env: process.env.NODE_ENV ?? 'development' });
  startCronJobs();
  logger.info('cron.started', { event: 'cron.started' });
});