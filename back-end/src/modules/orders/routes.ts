import { Router } from 'express';
import { auth } from '../../auth/middleware.js';
import { handle, userIdOf } from '../../common/utils/errors.js';
import { createReturnSchema, createReturnService } from '../returns/services.js';
import { ordersListController, orderGetController, orderCancelController, orderResumeController } from './controllers.js';

const ordersRoutes: Router = Router();

ordersRoutes.use(auth);

ordersRoutes.get('/', ordersListController);
ordersRoutes.get('/:id', orderGetController);
ordersRoutes.post('/:id/cancel', orderCancelController);
ordersRoutes.post('/:id/resume', orderResumeController);
ordersRoutes.post('/:id/returns', handle(async (req, res) => {
  const body = createReturnSchema.parse(req.body);
  res.status(201).json(await createReturnService(userIdOf(req), req.params.id as string, body));
}));

export default ordersRoutes;