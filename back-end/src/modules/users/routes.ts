import { Router } from 'express';
import { auth } from '../../auth/middleware.js';
import logger from '../../common/utils/logger.js';
import { handle, userIdOf } from '../../common/utils/errors.js';
import { addressSchema, profileSchema } from './dto.js';
import {
  createAddressService,
  deleteAddressService,
  getMeService,
  listAddressesService,
  updateAddressService,
  updateMeService,
} from './services.js';

const userRoutes: Router = Router();

userRoutes.use(auth);


userRoutes.get('/me', handle(async (req, res) => {
  res.json(await getMeService(userIdOf(req)));
}));

userRoutes.patch('/me', handle(async (req, res) => {
  const { name } = profileSchema.parse(req.body);
  res.json(await updateMeService(userIdOf(req), name));
  logger.info('user.profile.updated', { event: 'user.profile.updated', fields: ['name'] });
}));

userRoutes.get('/me/addresses', handle(async (req, res) => {
  res.json({ addresses: await listAddressesService(userIdOf(req)) });
}));

userRoutes.post('/me/addresses', handle(async (req, res) => {
  const address = await createAddressService(userIdOf(req), addressSchema.parse(req.body));
  logger.info('user.address.created', { event: 'user.address.created', addressId: address.id });
  res.status(201).json(address);
}));

userRoutes.put('/me/addresses/:id', handle(async (req, res) => {
  res.json(await updateAddressService(userIdOf(req), req.params.id as string, addressSchema.parse(req.body)));
  logger.info('user.address.updated', { event: 'user.address.updated', addressId: req.params.id });
}));

userRoutes.delete('/me/addresses/:id', handle(async (req, res) => {
  await deleteAddressService(userIdOf(req), req.params.id as string);
  logger.info('user.address.deleted', { event: 'user.address.deleted', addressId: req.params.id });
  res.status(204).send();
}));

export default userRoutes;
