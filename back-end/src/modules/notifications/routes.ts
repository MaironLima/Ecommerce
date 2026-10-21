import { Router } from 'express';
import { auth } from '../../auth/middleware.js';
import { handleError, userIdOf } from '../../common/utils/errors.js';
import { listNotificationsService, markAllReadService, markReadService } from './services.js';

const notificationRoutes: Router = Router();

notificationRoutes.use(auth);

notificationRoutes.get('/', async (req, res) => {
  try {
    res.json({ notifications: await listNotificationsService(userIdOf(req)) });
  } catch (e) {
    handleError(res, e);
  }
});

notificationRoutes.patch('/read-all', async (req, res) => {
  try {
    await markAllReadService(userIdOf(req));
    res.status(204).send();
  } catch (e) {
    handleError(res, e);
  }
});

notificationRoutes.patch('/:id/read', async (req, res) => {
  try {
    await markReadService(userIdOf(req), req.params.id as string);
    res.status(204).send();
  } catch (e) {
    handleError(res, e);
  }
});

export default notificationRoutes;
