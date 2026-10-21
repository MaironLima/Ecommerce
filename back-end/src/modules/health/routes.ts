import { Router } from 'express';
import { healthController, pingController } from './controllers.js';

const pingRoutes: Router = Router();

pingRoutes.get('/', pingController);

export const healthRoutes: Router = Router();

healthRoutes.get('/', healthController);

export default pingRoutes;
