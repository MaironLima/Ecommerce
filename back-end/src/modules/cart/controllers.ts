import { Request, Response } from 'express';
import { HttpError, handleError, userIdOf } from '../../common/utils/errors.js';
import { cartAddService, cartDeleteService, cartGetService, cartPutService } from './services.js';
import { cartAddSchema, cartUpdateSchema } from './dto.js';
import logger from '../../common/utils/logger.js';

export const cartAddController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const parsed = cartAddSchema.parse(req.body);

    await cartAddService(userId, parsed.variant_id, parsed.quantity);
    logger.info('cart.item.added', { event: 'cart.item.added', variantId: parsed.variant_id, quantity: parsed.quantity });

    res.status(201).json({ message: 'Product added on cart successfully' });
  } catch (e: any) {
    handleError(res, e);
  }
};

export const cartGetController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);

    const cart = await cartGetService(userId);

    res.status(200).json(cart);
  } catch (e: any) {
    handleError(res, e);
  }
};

export const cartPutController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const itemId = req.params.id;
    const parsed = cartUpdateSchema.parse(req.body);

    if (!itemId) throw new HttpError(400, 'Item id is required', 'INVALID_PARAM');

    await cartPutService(userId, itemId, parsed.quantity);
    logger.info('cart.item.updated', { event: 'cart.item.updated', itemId, quantity: parsed.quantity });

    res.status(200).json({ message: 'The product has been updated' });
  } catch (e: any) {
    handleError(res, e);
  }
};

export const cartDeleteController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const itemId = req.params.id;

    if (!itemId) throw new HttpError(400, 'Item id is required', 'INVALID_PARAM');

    await cartDeleteService(userId, itemId);
    logger.info('cart.item.removed', { event: 'cart.item.removed', itemId });

    res.status(204).send();
  } catch (e: any) {
    handleError(res, e);
  }
};