import { prisma } from '../../libs/prisma.js';
import logger from './logger.js';

// Records an administrative action. Never throws: auditing must not block the action itself.
export async function audit(
  actorId: string | undefined,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await prisma.auditLog.create({
      data: {
        actor_id: actorId ?? null,
        action,
        entity_type: entityType,
        entity_id: entityId ?? null,
        ...(metadata ? { metadata: metadata as object } : {}),
      },
    });
    logger.info('audit', { actorId, action, entityType, entityId });
  } catch (e) {
    logger.error('audit failed', { action, entityType, entityId, error: (e as Error).message });
  }
}
