import { Router } from 'express';
import * as z from 'zod';
import requireAdmin from '../../common/middleware/requireAdmin.js';
import requireAnyRole from '../../common/middleware/requireAnyRole.js';
import { handle, userIdOf } from '../../common/utils/errors.js';
import { audit } from '../../common/utils/audit.js';
import { HttpError } from '../../common/utils/errors.js';
import logger from '../../common/utils/logger.js';
import { logQuerySchema, searchLogs } from './logs.js';
import {
  analyticsService,
  changeRoleService,
  listAuditService,
  listOrdersAdminService,
  listUsersService,
} from './services.js';

const adminRoutes: Router = Router();

adminRoutes.use(requireAdmin);

const roleSchema = z.object({ role: z.enum(['CUSTOMER', 'ADMIN', 'SUPERADMIN']) });
const statusSchema = z.enum(['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED']).optional();


adminRoutes.get('/analytics', handle(async (_req, res) => {
  res.json(await analyticsService());
}));

adminRoutes.get('/users', handle(async (_req, res) => {
  res.json({ users: await listUsersService() });
}));

// Only SUPERADMIN can grant/revoke roles.
adminRoutes.patch('/users/:id/role', requireAnyRole(['SUPERADMIN']), handle(async (req, res) => {
  const actorId = userIdOf(req);
  const { role } = roleSchema.parse(req.body);
  const user = await changeRoleService(actorId, req.params.id as string, role);
  await audit(actorId, 'USER_ROLE_CHANGE', 'User', user.id, { role });
  res.json(user);
}));

adminRoutes.get('/orders', handle(async (req, res) => {
  const status = statusSchema.parse(req.query.status || undefined);
  res.json({ orders: await listOrdersAdminService(status) });
}));

adminRoutes.get('/audit', handle(async (_req, res) => {
  res.json({ logs: await listAuditService() });
}));

// Log viewer. The access log holds full IPs (Marco Civil), so only SUPERADMIN reads it and every read is audited.
adminRoutes.get('/logs', handle(async (req, res) => {
  const query = logQuerySchema.parse(req.query);
  const actorId = userIdOf(req);
  if (query.source === 'access') {
    if ((req as any).user?.role !== 'SUPERADMIN') {
      throw new HttpError(403, 'Only SUPERADMIN can read the access log', 'FORBIDDEN');
    }
    await audit(actorId, 'ACCESS_LOG_VIEW', 'Logs', undefined, { from: query.from, to: query.to });
  }
  logger.info('admin.logs.viewed', { event: 'admin.logs.viewed', source: query.source });
  res.json(await searchLogs(query));
}));

export default adminRoutes;
