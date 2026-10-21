import { Request, Response } from 'express';
import { HttpError, handleError, userIdOf } from '../../common/utils/errors.js';
import {
  createCheckoutSessionService,
  getCheckoutStatusService,
  confirmCheckoutService,
} from './services.js';
import { checkoutCreateSchema } from './dto.js';

export const checkoutCreateController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const parsed = checkoutCreateSchema.parse(req.body);

    const result = await createCheckoutSessionService(
      userId,
      parsed.shipping_address as Record<string, unknown> | undefined,
      parsed.currency,
      parsed.cart_item_ids,
    );

    res.status(201).json(result);
  } catch (e: any) {
    handleError(res, e);
  }
};

export const checkoutStatusController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const orderId = req.params.orderId;

    if (!orderId) throw new HttpError(400, 'orderId is required', 'INVALID_PARAM');

    const result = await getCheckoutStatusService(userId, orderId);

    res.status(200).json(result);
  } catch (e: any) {
    handleError(res, e);
  }
};

export const checkoutConfirmController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const orderId = req.params.orderId;

    if (!orderId) throw new HttpError(400, 'orderId is required', 'INVALID_PARAM');

    const result = await confirmCheckoutService(userId, orderId);

    res.status(200).json(result);
  } catch (e: any) {
    handleError(res, e);
  }
};
