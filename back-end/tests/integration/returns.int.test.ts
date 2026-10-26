import { describe, it, expect, beforeAll, vi } from 'vitest';

// Dev webhook bypass (no signature) and a fake Stripe: everything else is the real DB.
const stripeState = vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'dev';
  return { refundStatus: 'succeeded', calls: [] as { amount: number; key: string }[] };
});
vi.mock('../../src/libs/stripe.js', () => ({
  stripe: {
    refunds: {
      create: vi.fn(async (params: { amount: number }, opts: { idempotencyKey: string }) => {
        stripeState.calls.push({ amount: params.amount, key: opts.idempotencyKey });
        return { id: `re_${opts.idempotencyKey}`, status: stripeState.refundStatus };
      }),
    },
  },
}));

import { api, createPaidOrder, createProduct, createUser, prisma, resetDb, stockOf } from './helpers.js';

let customer: Awaited<ReturnType<typeof createUser>>;
let admin: Awaited<ReturnType<typeof createUser>>;
let product: Awaited<ReturnType<typeof createProduct>>;
let orderId: string;
let itemId: string;

const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await resetDb();
  customer = await createUser();
  admin = await createUser('ADMIN');
  product = await createProduct({ title: 'Return Speaker', price: 40, stock: 5 });
  const order = await createPaidOrder(customer.user.id, product.variant, 'Return Speaker', 40, 3);
  await prisma.order.update({ where: { id: order.id }, data: { stripe_payment_intent_id: 'pi_return_1' } });
  orderId = order.id;
  itemId = (await prisma.orderItem.findFirstOrThrow({ where: { order_id: orderId } })).id;
});

const request = (body: object, who = customer) => api().post(`/orders/${orderId}/returns`).set('Authorization', who.auth).send(body);

async function freshReturn(reason = 'REGRET') {
  const order = await createPaidOrder(customer.user.id, product.variant, 'Return Speaker', 40, 1);
  const item = await prisma.orderItem.findFirstOrThrow({ where: { order_id: order.id } });
  const res = await api()
    .post(`/orders/${order.id}/returns`)
    .set('Authorization', customer.auth)
    .send({ items: [{ order_item_id: item.id, quantity: 1 }], reason });
  return res.body.id as string;
}

describe('Integration - returns & refunds', () => {
  let returnId: string;

  it('the order list says the order can be returned and how many units', async () => {
    const res = await api().get('/orders').set('Authorization', customer.auth);
    const order = res.body.find((o: any) => o.id === orderId);
    expect(order.returnable).toBe(true);
    expect(order.remaining[itemId]).toBe(3);
  });

  it('rejects other users, too many units and items from other orders', async () => {
    const intruder = await createUser();
    expect((await request({ items: [{ order_item_id: itemId, quantity: 1 }], reason: 'REGRET' }, intruder)).status).toBe(404);
    const tooMany = await request({ items: [{ order_item_id: itemId, quantity: 4 }], reason: 'REGRET' });
    expect(tooMany.body.code).toBe('QUANTITY_EXCEEDED');
    const foreign = await request({ items: [{ order_item_id: crypto.randomUUID(), quantity: 1 }], reason: 'REGRET' });
    expect(foreign.body.code).toBe('INVALID_ITEM');
  });

  it('customer requests a partial return; a second open request is refused', async () => {
    const res = await request({ items: [{ order_item_id: itemId, quantity: 2 }], reason: 'DEFECTIVE', comment: 'Stopped working' });
    expect(res.status).toBe(201);
    expect(res.body.refund_amount).toBe(80);
    returnId = res.body.id;

    const again = await request({ items: [{ order_item_id: itemId, quantity: 1 }], reason: 'REGRET' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('RETURN_ALREADY_OPEN');
  });

  it('a customer cannot use admin actions', async () => {
    const res = await api().patch(`/admin/returns/${returnId}/approve`).set('Authorization', customer.auth);
    expect(res.status).toBe(403);
  });

  it('cannot skip steps: refund before receiving fails', async () => {
    const res = await api().post(`/admin/returns/${returnId}/refund`).set('Authorization', admin.auth);
    expect(res.status).toBe(409);
  });

  it('approve then received puts the units back in stock', async () => {
    expect((await api().patch(`/admin/returns/${returnId}/approve`).set('Authorization', admin.auth)).body.status).toBe('APPROVED');
    expect(await stockOf(product.variant.id)).toBe(5);
    expect((await api().patch(`/admin/returns/${returnId}/received`).set('Authorization', admin.auth)).body.status).toBe('RECEIVED');
    expect(await stockOf(product.variant.id)).toBe(7);
  });

  it('refund calls Stripe once with the right amount and marks the order PARTIALLY_REFUNDED', async () => {
    const res = await api().post(`/admin/returns/${returnId}/refund`).set('Authorization', admin.auth);
    expect(res.body.status).toBe('REFUNDED');
    expect(stripeState.calls).toEqual([{ amount: 8000, key: `return-${returnId}` }]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PARTIALLY_REFUNDED');

    const repeat = await api().post(`/admin/returns/${returnId}/refund`).set('Authorization', admin.auth);
    expect(repeat.status).toBe(409);
    expect(stripeState.calls).toHaveLength(1);

    const notes = await prisma.notification.findMany({ where: { user_id: customer.user.id } });
    expect(notes.map((n) => n.type).sort()).toEqual(['RETURN_APPROVED', 'RETURN_REFUNDED']);
  });

  it('audit trail has the admin actions without the customer comment', async () => {
    const logs = await prisma.auditLog.findMany({ where: { entity_id: returnId }, orderBy: { created_at: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['RETURN_APPROVE', 'RETURN_RECEIVED', 'RETURN_REFUND']);
    expect(JSON.stringify(logs)).not.toContain('Stopped working');
  });

  it('a pending refund is finished by the charge.refunded webhook; last unit makes it REFUNDED', async () => {
    stripeState.refundStatus = 'pending';
    const res = await request({ items: [{ order_item_id: itemId, quantity: 1 }], reason: 'REGRET' });
    const id = res.body.id;
    for (const step of ['approve', 'received']) await api().patch(`/admin/returns/${id}/${step}`).set('Authorization', admin.auth);
    const refund = await api().post(`/admin/returns/${id}/refund`).set('Authorization', admin.auth);
    expect(refund.body.status).toBe('RECEIVED');

    const event = { id: 'evt_refund_1', type: 'charge.refunded', data: { object: { payment_intent: 'pi_return_1', amount: 12000, amount_refunded: 12000 } } };
    const hook = await api().post('/webhooks/stripe').set('Content-Type', 'application/json').send(JSON.stringify(event));
    expect(hook.status).toBe(200);
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id } })).status).toBe('REFUNDED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('REFUNDED');

    const list = await api().get('/orders').set('Authorization', customer.auth);
    expect(list.body.find((o: any) => o.id === orderId).returnable).toBe(false);
  });

  it('orders older than the window cannot be returned', async () => {
    const old = await createPaidOrder(customer.user.id, product.variant, 'Return Speaker', 40, 1, new Date(Date.now() - 8 * DAY));
    const oldItem = await prisma.orderItem.findFirstOrThrow({ where: { order_id: old.id } });
    const late = await api()
      .post(`/orders/${old.id}/returns`)
      .set('Authorization', customer.auth)
      .send({ items: [{ order_item_id: oldItem.id, quantity: 1 }], reason: 'REGRET' });
    expect(late.body.code).toBe('RETURN_WINDOW_CLOSED');
  });

  it('customer can cancel only while REQUESTED', async () => {
    const id = await freshReturn();
    expect((await api().post(`/returns/${id}/cancel`).set('Authorization', customer.auth)).body.status).toBe('CANCELLED');
    expect((await api().post(`/returns/${id}/cancel`).set('Authorization', customer.auth)).status).toBe(409);

    const mine = await api().get('/returns').set('Authorization', customer.auth);
    expect(mine.body.returns).toHaveLength(3);
  });

  it('reject needs a note and the admin queue filters by status', async () => {
    const id = await freshReturn('OTHER');
    expect((await api().patch(`/admin/returns/${id}/reject`).set('Authorization', admin.auth).send({})).status).toBe(400);
    const rejected = await api().patch(`/admin/returns/${id}/reject`).set('Authorization', admin.auth).send({ admin_note: 'Outside policy' });
    expect(rejected.body.status).toBe('REJECTED');

    const queue = await api().get('/admin/returns?status=REJECTED').set('Authorization', admin.auth);
    expect(queue.body.returns).toHaveLength(1);
    expect(queue.body.returns[0].customer).toEqual({ name: customer.user.name });
  });
});
