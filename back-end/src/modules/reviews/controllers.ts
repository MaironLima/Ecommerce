import { Request, Response } from 'express';
import {
  reviewDeleteService,
  reviewEligibilityService,
  reviewGetAllService,
  reviewGetService,
  reviewPostService,
  reviewValidationService,
} from './services.js';
import { reviewSchema } from './dto.js';
import { handleError, userIdOf } from '../../common/utils/errors.js';
import { audit } from '../../common/utils/audit.js';
import logger from '../../common/utils/logger.js';

const isAdminRole = (role?: string) => role === 'ADMIN' || role === 'SUPERADMIN';

export const reviewGetAllController = async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ reviews: await reviewGetAllService() });
  } catch (e) {
    handleError(res, e);
  }
};

export const reviewGetController = async (req: Request, res: Response) => {
  try {
    res.status(200).json({ reviews: await reviewGetService(req.params.id as string) });
  } catch (e) {
    handleError(res, e);
  }
};

export const reviewEligibilityController = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await reviewEligibilityService(userIdOf(req), req.params.id as string));
  } catch (e) {
    handleError(res, e);
  }
};

export const reviewPostController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const { rating, title, comment } = reviewSchema.parse(req.body);
    const review = await reviewPostService(req.params.id as string, userId, rating, title, comment);
    logger.info('review.created', { event: 'review.created', reviewId: review.id, productId: req.params.id, rating });
    res.status(201).json({ message: 'Review submitted and awaiting moderation', review });
  } catch (e) {
    handleError(res, e);
  }
};

export const reviewValidationController = async (req: Request, res: Response) => {
  try {
    const reviewId = req.params.reviewId as string;
    await reviewValidationService(reviewId);
    await audit((req as any).user?.userId, 'REVIEW_APPROVE', 'Review', reviewId);
    res.status(200).json({ message: 'Review approved' });
  } catch (e) {
    handleError(res, e);
  }
};

export const reviewDeleteController = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const reviewId = req.params.reviewId as string;
    const isAdmin = isAdminRole((req as any).user?.role);
    await reviewDeleteService(reviewId, userId, isAdmin);
    logger.info('review.deleted', { event: 'review.deleted', reviewId, byAdmin: isAdmin });
    if (isAdmin) await audit(userId, 'REVIEW_DELETE', 'Review', reviewId);
    res.status(204).send();
  } catch (e) {
    handleError(res, e);
  }
};
