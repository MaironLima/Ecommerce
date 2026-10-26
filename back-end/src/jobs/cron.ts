import cron from "node-cron";
import { releaseExpiredReservations } from "../modules/stock/services.js";
import { cancelStalePendingOrdersService } from "../modules/orders/services.js";
import logger from "../common/utils/logger.js";

export function startCronJobs() {
  cron.schedule("*/1 * * * *", async () => {
    try {
      const result = await releaseExpiredReservations();
      if (result.released > 0) {
        logger.info(`[cron] ${result.released} expired reservations returned to stock`, {
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      logger.error(`[cron] Failed to release reservations: ${(e as Error).message}`, {
        timestamp: new Date().toISOString(),
      });
    }
  });

  cron.schedule("*/5 * * * *", async () => {
    try {
      const result = await cancelStalePendingOrdersService();
      if (result.cancelled > 0) {
        logger.info(`[cron] ${result.cancelled} stale pending orders cancelled`, {
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      logger.error(`[cron] Failed to cancel pending orders: ${(e as Error).message}`, {
        timestamp: new Date().toISOString(),
      });
    }
  });
}