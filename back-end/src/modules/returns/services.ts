import * as z from 'zod';
import { prisma } from '../../libs/prisma.js';
import { stripe } from '../../libs/stripe.js';
import { HttpError } from '../../common/utils/errors.js';
import logger from '../../common/utils/logger.js';
import { notify } from '../notifications/services.js';
import { OPEN_STATUSES, refundCents, remainingQuantities, returnDeadline, statusAfterRefund } from './rules.js';

export const createReturnSchema = z.object({
  items: z
    .array(z.object({ order_item_id: z.string().uuid(), quantity: z.number().int().positive() }))
    .min(1, 'Select at least one item'),
  reason: z.enum(['REGRET', 'DEFECTIVE', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'OTHER']),
  comment: z.string().trim().max(500).optional(),
});

export const rejectSchema = z.object({ admin_note: z.string().trim().min(3).max(500) });

export const returnStatusSchema = z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CANCELLED']).optional();

const RETURNABLE_ORDER = ['PAID', 'PARTIALLY_REFUNDED'];
const shortId = (id: string) => `#${id.slice(0, 8)}`;

type OrderWithReturns = {
  status: string;
  created_at: Date;
  order_item: { id: string; quantity: number; unit_price_snapshot: number }[];
  return_request: { status: string; return_item: { order_item_id: string; quantity: number }[] }[];
};

// What the customer screen needs to show/hide "Request return".
export function returnInfo(order: OrderWithReturns, now = new Date()) {
  const deadline = returnDeadline(order.created_at);
  const left = remainingQuantities(order.order_item, order.return_request);
  const hasOpen = order.return_request.some((r) => (OPEN_STATUSES as readonly string[]).includes(r.status));
  const eligible =
    RETURNABLE_ORDER.includes(order.status) && now <= deadline && !hasOpen && [...left.values()].some((q) => q > 0);
  return { return_deadline: deadline, returnable: eligible, remaining: Object.fromEntries(left) };
}

export async function createReturnService(userId: string, orderId: string, input: z.infer<typeof createReturnSchema>) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    include: { order_item: true, return_request: { include: { return_item: true } } },
  });
  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  if (!RETURNABLE_ORDER.includes(order.status)) throw new HttpError(409, `Cannot return an order in status ${order.status}`, 'INVALID_STATUS');
  if (new Date() > returnDeadline(order.created_at)) throw new HttpError(409, 'The return window for this order has closed', 'RETURN_WINDOW_CLOSED');

  const left = remainingQuantities(order.order_item, order.return_request);
  for (const item of input.items) {
    if (!left.has(item.order_item_id)) throw new HttpError(400, 'Item does not belong to this order', 'INVALID_ITEM');
    if (item.quantity > (left.get(item.order_item_id) ?? 0)) throw new HttpError(409, 'Quantity is more than you can still return', 'QUANTITY_EXCEEDED');
  }

  const cents = refundCents(order.order_item, input.items);
  try {
    const created = await prisma.returnRequest.create({
      data: {
        order_id: order.id,
        user_id: userId,
        reason: input.reason,
        comment: input.comment || null,
        refund_amount: cents / 100,
        return_item: { create: input.items },
      },
    });
    // The free-text comment may contain personal data: ids and amounts only (LGPD minimization).
    logger.info('return.requested', { event: 'return.requested', returnId: created.id, orderId: order.id, amount: cents / 100 });
    return { id: created.id, status: created.status, refund_amount: cents / 100 };
  } catch (e: any) {
    // Partial unique index: one open request per order.
    if (e?.code === 'P2002') throw new HttpError(409, 'There is already an open return for this order', 'RETURN_ALREADY_OPEN');
    throw e;
  }
}

export async function listMyReturnsService(userId: string) {
  const returns = await prisma.returnRequest.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: { return_item: { include: { order_item_sync: { select: { product_title_snapshot: true } } } } },
  });
  return returns.map((r) => ({
    id: r.id,
    order_id: r.order_id,
    status: r.status,
    reason: r.reason,
    refund_amount: Number(r.refund_amount),
    admin_note: r.admin_note,
    created_at: r.created_at,
    items: r.return_item.map((i) => ({ order_item_id: i.order_item_id, quantity: i.quantity, title: i.order_item_sync.product_title_snapshot })),
  }));
}

// Race-safe state change: only moves when the request is still in `from`.
async function transition(id: string, from: string, data: Record<string, unknown>, where: Record<string, unknown> = {}) {
  const { count } = await prisma.returnRequest.updateMany({ where: { id, status: from as any, ...where }, data });
  if (count === 0) {
    const exists = await prisma.returnRequest.findFirst({ where: { id, ...where }, select: { status: true } });
    if (!exists) throw new HttpError(404, 'Return request not found', 'RETURN_NOT_FOUND');
    throw new HttpError(409, `Return request is ${exists.status}, expected ${from}`, 'INVALID_STATUS');
  }
  return prisma.returnRequest.findUniqueOrThrow({ where: { id } });
}

export async function cancelReturnService(userId: string, id: string) {
  const r = await transition(id, 'REQUESTED', { status: 'CANCELLED', resolved_at: new Date() }, { user_id: userId });
  logger.info('return.cancelled', { event: 'return.cancelled', returnId: id });
  return { id: r.id, status: r.status };
}

// ---------- Admin ----------

export async function listReturnsAdminService(status?: string) {
  const returns = await prisma.returnRequest.findMany({
    where: status ? { status: status as any } : {},
    orderBy: { created_at: 'desc' },
    take: 200,
    include: {
      user_sync: { select: { name: true } },
      return_item: { include: { order_item_sync: { select: { product_title_snapshot: true } } } },
    },
  });
  return returns.map((r) => ({
    id: r.id,
    order_id: r.order_id,
    status: r.status,
    reason: r.reason,
    comment: r.comment,
    admin_note: r.admin_note,
    refund_amount: Number(r.refund_amount),
    created_at: r.created_at,
    resolved_at: r.resolved_at,
    customer: { name: r.user_sync.name },
    items: r.return_item.map((i) => ({ quantity: i.quantity, title: i.order_item_sync.product_title_snapshot })),
  }));
}

export async function approveReturnService(id: string) {
  const r = await transition(id, 'REQUESTED', { status: 'APPROVED' });
  await notify(r.user_id, 'RETURN_APPROVED', `Your return for order ${shortId(r.order_id)} was approved. Please send the items back.`);
  return r;
}

export async function rejectReturnService(id: string, adminNote: string) {
  const r = await transition(id, 'REQUESTED', { status: 'REJECTED', admin_note: adminNote, resolved_at: new Date() });
  await notify(r.user_id, 'RETURN_REJECTED', `Your return for order ${shortId(r.order_id)} was not accepted: ${adminNote}`);
  return r;
}

// Items arrived: put them back in stock in the same transaction as the status change.
export async function receiveReturnService(id: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.returnRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'RECEIVED' } });
    if (count === 0) {
      const exists = await tx.returnRequest.findUnique({ where: { id }, select: { status: true } });
      if (!exists) throw new HttpError(404, 'Return request not found', 'RETURN_NOT_FOUND');
      throw new HttpError(409, `Return request is ${exists.status}, expected APPROVED`, 'INVALID_STATUS');
    }
    const items = await tx.returnItem.findMany({ where: { return_id: id }, include: { order_item_sync: { select: { variant_id: true } } } });
    for (const item of items) {
      await tx.productVariant.update({ where: { id: item.order_item_sync.variant_id }, data: { stock: { increment: item.quantity } } });
    }
    return tx.returnRequest.findUniqueOrThrow({ where: { id } });
  });
}

export async function refundReturnService(id: string) {
  const r = await prisma.returnRequest.findUnique({ where: { id }, include: { order_sync: { select: { stripe_payment_intent_id: true } } } });
  if (!r) throw new HttpError(404, 'Return request not found', 'RETURN_NOT_FOUND');
  if (r.status !== 'RECEIVED') throw new HttpError(409, `Return request is ${r.status}, expected RECEIVED`, 'INVALID_STATUS');
  if (r.stripe_refund_id) throw new HttpError(409, 'Refund already in progress', 'REFUND_IN_PROGRESS');
  const paymentIntent = r.order_sync.stripe_payment_intent_id;
  if (!paymentIntent) throw new HttpError(409, 'Order has no Stripe payment to refund', 'NO_PAYMENT');

  const amount = Math.round(Number(r.refund_amount) * 100);
  let refund;
  try {
    // Same key on retries: Stripe never refunds the same request twice.
    refund = await stripe.refunds.create({ payment_intent: paymentIntent, amount }, { idempotencyKey: `return-${id}` });
  } catch (err) {
    logger.error('return.refund_failed', { event: 'return.refund_failed', returnId: id, reason: (err as Error).message });
    throw new HttpError(502, `Stripe error: ${(err as Error).message}`, 'STRIPE_ERROR');
  }

  await prisma.returnRequest.update({ where: { id }, data: { stripe_refund_id: refund.id } });
  // Card refunds in test mode succeed at once; otherwise the charge.refunded webhook finishes it.
  if (refund.status === 'succeeded') await finalizeRefund(id);
  return prisma.returnRequest.findUniqueOrThrow({ where: { id } });
}

// Single place where a return becomes REFUNDED (refund call and webhook both land here). Idempotent.
export async function finalizeRefund(id: string) {
  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.returnRequest.updateMany({ where: { id, status: 'RECEIVED' }, data: { status: 'REFUNDED', resolved_at: new Date() } });
    if (count === 0) return null;
    const r = await tx.returnRequest.findUniqueOrThrow({ where: { id } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: r.order_id }, include: { order_item: true, return_request: { include: { return_item: true } } } });
    await tx.order.update({ where: { id: order.id }, data: { status: statusAfterRefund(order.order_item, order.return_request) } });
    return r;
  });
  if (!done) return;

  const amount = Number(done.refund_amount);
  logger.info('return.refunded', { event: 'return.refunded', returnId: id, orderId: done.order_id, amount });
  await notify(done.user_id, 'RETURN_REFUNDED', `Refund of $ ${amount.toFixed(2)} for order ${shortId(done.order_id)} was issued to your card.`, {
    subject: 'Your refund was issued',
    link: '/profile?tab=orders',
    linkLabel: 'View your orders',
  });
}
