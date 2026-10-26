import { prisma } from '../../libs/prisma.js';
import logger from './logger.js';
import { redact } from './privacy.js';

// Records an administrative action. Never throws: auditing must not block the action itself.
// Metadata goes through the same redaction as the logs (LGPD: no credentials, addresses or full e-mails in the trail).
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
        ...(metadata ? { metadata: redact(metadata) as object } : {}),
      },
    });
    logger.info('audit', { actorId, action, entityType, entityId });
  } catch (e) {
    logger.error('audit failed', { action, entityType, entityId, error: (e as Error).message });
  }
}
