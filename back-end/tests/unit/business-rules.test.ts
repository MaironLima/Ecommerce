import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../src/libs/prisma.js', () => ({
  prisma: {
    orderItem: { findFirst: vi.fn() },
    review: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from '../../src/libs/prisma.js';
import { reviewDeleteService, reviewPostService } from '../../src/modules/reviews/services.js';
import { summarize } from '../../src/modules/admin/services.js';
import { createApp } from '../../src/appFactory.js';

const db = prisma as any;
const tokenFor = (role: string) => `Bearer ${jwt.sign({ userId: 'u1', role }, process.env.JWT_SECRET as string)}`;

beforeEach(() => vi.clearAllMocks());

describe('Reviews - only buyers can review', () => {
  it('403 NOT_A_BUYER when the user has no paid order with the product', async () => {
    db.orderItem.findFirst.mockResolvedValue(null);
    await expect(reviewPostService('p1', 'u1', 5, 'Great')).rejects.toMatchObject({ status: 403, code: 'NOT_A_BUYER' });
    expect(db.review.create).not.toHaveBeenCalled();
  });

  it('409 ALREADY_REVIEWED on a second review of the same product', async () => {
    db.orderItem.findFirst.mockResolvedValue({ id: 'oi1' });
    db.review.findUnique.mockResolvedValue({ id: 'r1' });
    await expect(reviewPostService('p1', 'u1', 5, 'Great')).rejects.toMatchObject({ status: 409 });
  });

  it('creates the review (pending moderation) for a buyer', async () => {
    db.orderItem.findFirst.mockResolvedValue({ id: 'oi1' });
    db.review.findUnique.mockResolvedValue(null);
    db.review.create.mockResolvedValue({ id: 'r1', moderated: false });
    await expect(reviewPostService('p1', 'u1', 4, 'Nice', 'ok')).resolves.toMatchObject({ moderated: false });
    expect(db.orderItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { order_sync: { user_id: 'u1', status: 'PAID' }, variant_sync: { product_id: 'p1' } } }),
    );
  });

  it('only the owner or an admin can delete', async () => {
    db.review.findUnique.mockResolvedValue({ user_id: 'someone-else' });
    await expect(reviewDeleteService('r1', 'u1', false)).rejects.toMatchObject({ status: 403 });
    await expect(reviewDeleteService('r1', 'u1', true)).resolves.toBeUndefined();
  });
});

describe('Admin analytics - summarize', () => {
  it('computes AOV and checkout conversion', () => {
    expect(summarize({ revenue: 300, paidOrders: 3, totalOrders: 4, users: 10 })).toMatchObject({
      averageOrderValue: 100,
      conversionRate: 75,
    });
  });

  it('does not divide by zero', () => {
    expect(summarize({ revenue: 0, paidOrders: 0, totalOrders: 0, users: 0 })).toMatchObject({
      averageOrderValue: 0,
      conversionRate: 0,
    });
  });
});

describe('RBAC - admin routes', () => {
  const app = createApp();

  it('401 without a token', async () => {
    expect((await request(app).get('/admin/analytics')).status).toBe(401);
  });

  it('403 for a CUSTOMER', async () => {
    expect((await request(app).get('/admin/analytics').set('Authorization', tokenFor('CUSTOMER'))).status).toBe(403);
  });

  it('403 when an ADMIN tries a SUPERADMIN-only action', async () => {
    const res = await request(app)
      .patch('/admin/users/u2/role')
      .set('Authorization', tokenFor('ADMIN'))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  it('404 JSON for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
