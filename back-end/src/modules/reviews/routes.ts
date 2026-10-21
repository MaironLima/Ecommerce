import { Router } from 'express';
import { auth } from '../../auth/middleware.js';
import {
  reviewDeleteController,
  reviewEligibilityController,
  reviewGetAllController,
  reviewGetController,
  reviewPostController,
  reviewValidationController,
} from './controllers.js';
import requireAdmin from '../../common/middleware/requireAdmin.js';

const reviewRoutes = Router();

reviewRoutes.get('/reviews', requireAdmin, reviewGetAllController); // admin: moderation queue
reviewRoutes.get('/:id/review', reviewGetController);
reviewRoutes.get('/:id/review/eligibility', auth, reviewEligibilityController);
reviewRoutes.post('/:id/review', auth, reviewPostController);
reviewRoutes.put('/:reviewId/validation/review', requireAdmin, reviewValidationController); // admin
reviewRoutes.delete('/:reviewId/review', auth, reviewDeleteController); // owner or admin

export default reviewRoutes;
