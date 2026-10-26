import { Router } from 'express';
import { auth } from '../../auth/middleware.js';
import { handle, userIdOf } from '../../common/utils/errors.js';
import { cancelReturnService, listMyReturnsService } from './services.js';

const returnsRoutes: Router = Router();

returnsRoutes.use(auth);

returnsRoutes.get('/', handle(async (req, res) => {
  res.json({ returns: await listMyReturnsService(userIdOf(req)) });
}));

returnsRoutes.post('/:id/cancel', handle(async (req, res) => {
  res.json(await cancelReturnService(userIdOf(req), req.params.id as string));
}));

export default returnsRoutes;
