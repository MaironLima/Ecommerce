import { describe, it, expect, beforeAll, vi } from 'vitest';

// Stripe is the only external dependency replaced: everything else (DB, transactions, cron logic) is real.
const stripeState = vi.hoisted(() => ({ status: 'requires_payment_method', seq: 0 }));
vi.mock('../../src/libs/stripe.js', () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(async () => {
        stripeState.seq += 1;
        return { id: `pi_test_${stripeState.seq}`, client_secret: `pi_test_${stripeState.seq}_secret_x`, status: 'requires_payment_method' };
      }),
      retrieve: vi.fn(async (id: string) => ({ id, status: stripeState.status, client_secret: `${id}_secret_x` })),
      cancel: vi.fn(async (id: string) => ({ id, status: 'canceled' })),
    },
  },
}));

import { api, createProduct, createUser, prisma, resetDb, stockOf } from './helpers.js';
import { releaseExpiredReservations } from '../../src/modules/stock/services.js';

let customer: Awaited<ReturnType<typeof createUser>>;
let admin: Awaited<ReturnType<typeof createUser>>;
let product: Awaited<ReturnType<typeof createProduct>>;

beforeAll(async () => {
  await resetDb();
  customer = await createUser();
  admin = await createUser('ADMIN');
  product = await createProduct({ title: 'Journey Keyboard', price: 80, stock: 5 });
});

describe('Integration - cart reserves stock', () => {
  let itemId: string;

  it('adding to cart reserves stock immediately', async () => {
    const res = await api().post('/cart').set('Authorization', customer.auth).send({ variant_id: product.variant.id, quantity: 2 });
    expect(res.status).toBe(201);
    expect(await stockOf(product.variant.id)).toBe(3);

    const cart = await api().get('/cart').set('Authorization', customer.auth);
    expect(cart.body.cart_item).toHaveLength(1);
    itemId = cart.body.cart_item[0].id;
    expect(cart.body.cart_item[0].unit_price_snapshot).toBe(80);
  });

  it('cannot reserve more than the available stock', async () => {
    const res = await api().put(`/cart/${itemId}`).set('Authorization', customer.auth).send({ quantity: 99 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OUT_OF_STOCK');
    expect(await stockOf(product.variant.id)).toBe(3);
  });

  it('updating quantity adjusts the reservation both ways', async () => {
    await api().put(`/cart/${itemId}`).set('Authorization', customer.auth).send({ quantity: 1 });
    expect(await stockOf(product.variant.id)).toBe(4);
  });

  it('another user cannot touch my cart item', async () => {
    const intruder = await createUser();
    const res = await api().delete(`/cart/${itemId}`).set('Authorization', intruder.auth);
    expect(res.status).toBe(400);
    expect(await prisma.cartItem.findUnique({ where: { id: itemId } })).not.toBeNull();
  });

  it('the cron job returns expired reservations to stock', async () => {
    await prisma.inventoryReservation.updateMany({ where: { cart_item_id: itemId }, data: { expires_at: new Date(Date.now() - 1000) } });
    const { released } = await releaseExpiredReservations();
    expect(released).toBe(1);
    expect(await stockOf(product.variant.id)).toBe(5);
  });
});

describe('Integration - checkout → payment → review → moderation', () => {
  let orderId: string;

  it('a non-buyer cannot review yet', async () => {
    const res = await api().post(`/product/${product.product.id}/review`).set('Authorization', customer.auth).send({ rating: 5, title: 'Too early' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_A_BUYER');
  });

  it('checkout creates a PENDING order with the shipping address and notifies the customer', async () => {
    await api().post('/cart').set('Authorization', customer.auth).send({ variant_id: product.variant.id, quantity: 1 });
    const address = { label: 'Home', street: 'Rua A', number: '1', city: 'SP', state: 'SP', zip_code: '01000-000', country: 'BR' };

    const res = await api().post('/checkout/session').set('Authorization', customer.auth).send({ currency: 'usd', shipping_address: address });
    expect(res.status).toBe(201);
    expect(res.body.client_secret).toMatch(/^pi_test_/);
    orderId = res.body.order_id;

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('PENDING');
    expect(order.shipping_address).toMatchObject({ city: 'SP' });
    expect(await prisma.notification.count({ where: { user_id: customer.user.id, type: 'ORDER_CREATED' } })).toBe(1);
  });

  it('refreshing checkout reuses the same pending order (idempotent)', async () => {
    const again = await api().post('/checkout/session').set('Authorization', customer.auth).send({ currency: 'usd' });
    expect(again.body.order_id).toBe(orderId);
    expect(await prisma.order.count({ where: { user_id: customer.user.id } })).toBe(1);
  });

  it('confirming a succeeded payment marks PAID, empties the cart and notifies once', async () => {
    stripeState.status = 'succeeded';
    const res = await api().post(`/checkout/${orderId}/confirm`).set('Authorization', customer.auth);
    expect(res.body.status).toBe('PAID');

    // Second confirmation (e.g. webhook + poll) must not duplicate side effects.
    await api().get(`/checkout/${orderId}/status`).set('Authorization', customer.auth);

    expect(await prisma.cartItem.count({ where: { cart_sync: { user_id: customer.user.id } } })).toBe(0);
    expect(await prisma.inventoryReservation.count()).toBe(0);
    expect(await prisma.notification.count({ where: { user_id: customer.user.id, type: 'ORDER_PAID' } })).toBe(1);
    expect(await stockOf(product.variant.id)).toBe(4);
  });

  it('another user cannot read my order', async () => {
    const other = await createUser();
    expect((await api().get(`/orders/${orderId}`).set('Authorization', other.auth)).status).toBe(404);
  });

  it('the buyer becomes eligible, reviews once, and the review stays hidden until approved', async () => {
    const elig = await api().get(`/product/${product.product.id}/review/eligibility`).set('Authorization', customer.auth);
    expect(elig.body).toMatchObject({ canReview: true, purchased: true, review: null });

    const post = await api().post(`/product/${product.product.id}/review`).set('Authorization', customer.auth).send({ rating: 4, title: 'Solid keys', comment: 'Nice' });
    expect(post.status).toBe(201);

    const dup = await api().post(`/product/${product.product.id}/review`).set('Authorization', customer.auth).send({ rating: 5, title: 'Again' });
    expect(dup.status).toBe(409);

    const publicList = await api().get(`/product/${product.product.id}/review`);
    expect(publicList.body.reviews).toHaveLength(0);

    const queue = await api().get('/product/reviews').set('Authorization', admin.auth);
    const pending = queue.body.reviews.find((r: any) => r.title === 'Solid keys');
    expect(pending).toBeTruthy();

    expect((await api().put(`/product/${pending.id}/validation/review`).set('Authorization', customer.auth)).status).toBe(403);
    expect((await api().put(`/product/${pending.id}/validation/review`).set('Authorization', admin.auth)).status).toBe(200);

    const after = await api().get(`/product/${product.product.id}/review`);
    expect(after.body.reviews.map((r: any) => r.title)).toEqual(['Solid keys']);
    expect(await prisma.notification.count({ where: { user_id: customer.user.id, type: 'REVIEW_APPROVED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'REVIEW_APPROVE', entity_id: pending.id } })).toBe(1);
  });

  it('rejects invalid ratings', async () => {
    const res = await api().post(`/product/${product.product.id}/review`).set('Authorization', customer.auth).send({ rating: 6, title: 'Bad' });
    expect(res.status).toBe(400);
  });
});
