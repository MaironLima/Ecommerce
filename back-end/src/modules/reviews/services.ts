import { prisma } from '../../libs/prisma.js';
import { HttpError } from '../../common/utils/errors.js';
import { notify } from '../notifications/services.js';

const reviewerSelect = { id_sync: { select: { name: true } } } as const;

// Pending moderation queue (admin).
export async function reviewGetAllService() {
  return prisma.review.findMany({
    where: { moderated: false },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      rating: true,
      title: true,
      comment: true,
      moderated: true,
      created_at: true,
      id_sync: { select: { id: true, name: true } },
      product_sync: { select: { id: true, title: true } },
    },
  });
}

// Public list: approved reviews only.
export async function reviewGetService(productId: string) {
  return prisma.review.findMany({
    where: { product_id: productId, moderated: true },
    orderBy: { created_at: 'desc' },
    select: { id: true, rating: true, title: true, comment: true, created_at: true, ...reviewerSelect },
  });
}

export async function hasPurchasedProduct(userId: string, productId: string) {
  const paidItem = await prisma.orderItem.findFirst({
    where: {
      order_sync: { user_id: userId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
      variant_sync: { product_id: productId },
    },
    select: { id: true },
  });
  return Boolean(paidItem);
}

export async function reviewEligibilityService(userId: string, productId: string) {
  const [purchased, existing] = await Promise.all([
    hasPurchasedProduct(userId, productId),
    prisma.review.findUnique({
      where: { product_id_user_id: { product_id: productId, user_id: userId } },
      select: { id: true, moderated: true },
    }),
  ]);
  return { canReview: purchased && !existing, purchased, review: existing };
}

export async function reviewPostService(
  productId: string,
  userId: string,
  rating: number,
  title: string,
  comment?: string,
) {
  if (!(await hasPurchasedProduct(userId, productId))) {
    throw new HttpError(403, 'Only customers who bought this product can review it', 'NOT_A_BUYER');
  }

  const existing = await prisma.review.findUnique({
    where: { product_id_user_id: { product_id: productId, user_id: userId } },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, 'You already reviewed this product', 'ALREADY_REVIEWED');

  return prisma.review.create({
    data: { product_id: productId, user_id: userId, rating, title, ...(comment ? { comment } : {}) },
    select: { id: true, product_id: true, rating: true, title: true, comment: true, moderated: true, created_at: true },
  });
}

export async function reviewValidationService(reviewId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { product_sync: { select: { id: true, title: true } } },
  });
  if (!review) throw new HttpError(404, 'Review not found', 'NOT_FOUND');
  if (review.moderated) return review;

  const updated = await prisma.review.update({ where: { id: review.id }, data: { moderated: true } });

  await notify(review.user_id, 'REVIEW_APPROVED', `Your review of "${review.product_sync.title}" was approved.`, {
    subject: 'Your review is live',
    link: `/product/${review.product_sync.id}`,
    linkLabel: 'See your review',
  });

  return updated;
}

// Owner or admin can delete.
export async function reviewDeleteService(reviewId: string, userId: string, isAdmin: boolean) {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { user_id: true } });
  if (!review) throw new HttpError(404, 'Review not found', 'NOT_FOUND');
  if (!isAdmin && review.user_id !== userId) {
    throw new HttpError(403, 'You can only delete your own review', 'FORBIDDEN');
  }
  await prisma.review.delete({ where: { id: reviewId } });
}
