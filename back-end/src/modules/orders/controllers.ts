import { Request, Response } from 'express';
import { HttpError, handleError, userIdOf } from '../../common/utils/errors.js';
import { cancelOrderService, getOrderService, listOrdersService, resumeOrderService } from './services.js';
import logger from '../../common/utils/logger.js';

export const ordersListController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const orders = await listOrdersService(userId);
    res.status(200).json(orders);
  } catch (e: any) {
    handleError(res, e);
  }
};

export const orderGetController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const orderId = req.params.id;
    if (!orderId) throw new HttpError(400, 'Order id is required', 'INVALID_PARAM');

    const order = await getOrderService(userId, orderId);
    res.status(200).json(order);
  } catch (e: any) {
    handleError(res, e);
  }
};

export const orderCancelController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const orderId = req.params.id;
    if (!orderId) throw new HttpError(400, 'Order id is required', 'INVALID_PARAM');

    const result = await cancelOrderService(userId, orderId);
    logger.info('order.cancelled', { event: 'order.cancelled', orderId, by: 'customer' });
    res.status(200).json(result);
  } catch (e: any) {
    handleError(res, e);
  }
};

export const orderResumeController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const orderId = req.params.id;
    if (!orderId) throw new HttpError(400, 'Order id is required', 'INVALID_PARAM');

    const result = await resumeOrderService(userId, orderId);
    logger.info('order.resumed', { event: 'order.resumed', orderId });
    res.status(200).json(result);
  } catch (e: any) {
    handleError(res, e);
  }
};