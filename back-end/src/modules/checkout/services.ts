import { prisma } from '../../libs/prisma.js';
import { stripe } from '../../libs/stripe.js';
import { HttpError } from '../../common/utils/errors.js';
import { reserveStock } from '../stock/services.js';
import type Stripe from 'stripe';
import { notify } from '../notifications/services.js';
import logger from '../../common/utils/logger.js';

const RESERVATION_TTL_MS = 15 * 60 * 1000;

function reservationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + RESERVATION_TTL_MS);
}

// Single place where an order becomes PAID (webhook, confirm and status poll all land here).
export async function finalizeOrderAsPaid(orderId: string) {
  const paid = await prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { order_item: { select: { id: true, cart_item_id: true } } },
    });
    if (!order || order.status === 'PAID') return null;

    const cartItemIds = order.order_item
      .map(item => item.cart_item_id)
      .filter((id): id is string => Boolean(id));

    if (cartItemIds.length > 0) {
      const reservations = await tx.inventoryReservation.findMany({
        where: { cart_item_id: { in: cartItemIds } },
      });
      for (const reservation of reservations) {
        await tx.inventoryReservation.delete({ where: { id: reservation.id } });
      }
      await tx.cartItem.deleteMany({ where: { id: { in: cartItemIds } } });
    }

    await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
    return order;
  });

  if (paid) {
    logger.info('order.paid', { event: 'order.paid', orderId: paid.id, total: Number(paid.total) });
    await notify(paid.user_id, 'ORDER_PAID', `Payment confirmed for order #${paid.id.slice(0, 8)} ($ ${Number(paid.total).toFixed(2)}).`, {
      subject: 'Order Purchase Confirmed',
      link: '/profile',
      linkLabel: 'View your order and rate your purchase',
    });
  }
}

export async function createCheckoutSessionService(
  userId: string,
  shippingAddress?: Record<string, unknown>,
  currency: string = 'usd',
  cartItemIds?: string[],
) {
  if (!stripe) throw new HttpError(500, 'Stripe not configured', 'STRIPE_NOT_CONFIGURED');

  const cart = await prisma.cart.findFirst({
    where: { user_id: userId },
    include: {
      cart_item: {
        include: {
          variant_sync: { include: { product_sync: { select: { title: true } } } },
          inventory_reservation: true,
        },
      },
    },
  });

  if (!cart || cart.cart_item.length === 0) {
    throw new HttpError(400, 'Cart is empty', 'EMPTY_CART');
  }

  const selectedItems = cartItemIds
    ? cart.cart_item.filter(item => cartItemIds.includes(item.id))
    : cart.cart_item;

  if (selectedItems.length === 0) {
    throw new HttpError(400, 'No cart items selected', 'NO_SELECTED_ITEMS');
  }

  const selectedCartItemIds = selectedItems.map(item => item.id);

  // Idempotency: on a page refresh React Query re-fires the checkout request.
  // Reuse an existing PENDING order that already covers the same cart items
  // instead of creating a duplicate (which would collide on the unique
  // order_item.cart_item_id constraint).
  let reuseOrderId: string | null = null;

  const reuseCandidate = await prisma.orderItem.findFirst({
    where: { cart_item_id: { in: selectedCartItemIds } },
    include: { order_sync: true },
  });

  if (reuseCandidate?.order_sync?.status === 'PENDING') {
    const pendingOrder = reuseCandidate.order_sync;
    const coveringCount = await prisma.orderItem.count({
      where: {
        order_id: pendingOrder.id,
        cart_item_id: { in: selectedCartItemIds },
      },
    });

    if (coveringCount === selectedCartItemIds.length) {
      const piId = pendingOrder.stripe_payment_intent_id;

      if (piId && stripe) {
        let existing: Stripe.PaymentIntent | null = null;
        try {
          existing = await stripe.paymentIntents.retrieve(piId);
        } catch {
          existing = null;
        }

        // Webhook was missed — the payment actually succeeded. Finalize
        // locally so we stop handing out a dead client_secret.
        if (existing && existing.status === 'succeeded') {
          await finalizeOrderAsPaid(pendingOrder.id);
          throw new HttpError(
            409,
            'This order has already been paid. Check your orders page.',
            'ORDER_ALREADY_PAID',
          );
        }

        // Pristine / declined-then-reset: safe to reuse the same intent.
        if (existing && existing.status === 'requires_payment_method') {
          if (shippingAddress) {
            await prisma.order.update({
              where: { id: pendingOrder.id },
              data: { shipping_address: shippingAddress as object },
            });
          }
          return {
            order_id: pendingOrder.id,
            client_secret: existing.client_secret,
            order_status: pendingOrder.status,
            total: pendingOrder.total,
            currency: pendingOrder.currency,
          };
        }

        // Stuck / processing / requires_action / canceled: cancel the stale
        // intent and create a fresh one on the same order on retry below.
        try {
          await stripe.paymentIntents.cancel(piId);
        } catch {
          // ignore — may already be terminal
        }
        await prisma.order.update({
          where: { id: pendingOrder.id },
          data: { stripe_payment_intent_id: null, stripe_client_secret: null },
        });
      }

      reuseOrderId = pendingOrder.id;
    }
  }

  const now = new Date();
  await prisma.$transaction(async tx => {
    for (const item of selectedItems) {
      const loaded = item.inventory_reservation;
      if (loaded && loaded.expires_at > now) {
        continue;
      }

      const existing = await tx.inventoryReservation.findUnique({
        where: { cart_item_id: item.id },
      });

      if (existing) {
        await tx.inventoryReservation.update({
          where: { id: existing.id },
          data: { expires_at: reservationExpiry() },
        });
        continue;
      }

      await reserveStock(tx, item.variant_id, item.quantity, 'Insufficient stock for one or more cart items. Please refresh your cart and try again.');

      await tx.inventoryReservation.create({
        data: {
          variant_id: item.variant_id,
          cart_item_id: item.id,
          quantity: item.quantity,
          expires_at: reservationExpiry(),
        },
      });
    }
  });

  const total = selectedItems.reduce(
    (sum, item) => sum + Number(item.unit_price_snapshot) * item.quantity,
    0,
  );

  if (total <= 0) {
    throw new HttpError(400, 'Order total must be greater than 0', 'INVALID_TOTAL');
  }

  let orderId: string;
  let orderCopy;

  if (reuseOrderId) {
    orderId = reuseOrderId;
    await prisma.order.update({
      where: { id: orderId },
      data: {
        total,
        currency,
        status: 'PENDING',
        ...(shippingAddress ? { shipping_address: shippingAddress as object } : {}),
      },
    });
  } else {
    const order = await prisma.order.create({
      data: {
        user_id: userId,
        status: 'PENDING',
        total,
        currency,
        ...(shippingAddress ? { shipping_address: shippingAddress as object } : {}),
        order_item: {
          create: selectedItems.map(item => ({
            variant_id: item.variant_id,
            cart_item_id: item.id,
            quantity: item.quantity,
            unit_price_snapshot: item.unit_price_snapshot,
            product_title_snapshot: item.variant_sync.product_sync.title,
            variant_attributes_snapshot: item.variant_sync.attributes as object,
          })),
        },
      },
    });
    orderId = order.id;
    orderCopy = order;
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(total.toFixed(2)) * 100),
      currency,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { order_id: orderId, user_id: userId },
    });
  } catch (err) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'FAILED' },
    });
    logger.error('checkout.stripe_error', { event: 'checkout.stripe_error', orderId, reason: (err as Error).message });
    throw new HttpError(502, `Stripe error: ${(err as Error).message}`, 'STRIPE_ERROR');
  }

  logger.info('checkout.session.created', { event: 'checkout.session.created', orderId, total, currency, items: selectedItems.length, reused: Boolean(reuseOrderId) });

  await prisma.order.update({
    where: { id: orderId },
    data: {
      stripe_payment_intent_id: paymentIntent.id,
      stripe_client_secret: paymentIntent.client_secret ?? null,
    },
  });

  if (orderCopy) {
    await notify(userId, 'ORDER_CREATED', `Order #${orderCopy.id.slice(0, 8)} registered ($ ${Number(orderCopy.total).toFixed(2)}). Awaiting payment.`, {
      subject: 'Checkout Order Registered Successfully',
      link: '/profile',
      linkLabel: 'View your order',
    });
  }

  return {
    order_id: orderId,
    client_secret: paymentIntent.client_secret,
    order_status: 'PENDING',
    total,
    currency,
  };
}

export async function getCheckoutStatusService(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    select: {
      id: true,
      status: true,
      total: true,
      currency: true,
      stripe_client_secret: true,
      stripe_payment_intent_id: true,
    },
  });

  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');

  // Reconcile with Stripe: a PENDING order may have actually been paid, but
  // the webhook hasn't reached us (common in local dev without `stripe listen`).
  // Retrieve the real PaymentIntent status and finalize synchronously so the
  // client poll sees PAID without depending on webhook delivery.
  if (order.status === 'PENDING' && order.stripe_payment_intent_id && stripe) {
    try {
      const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);

      if (intent.status === 'succeeded') {
        await finalizeOrderAsPaid(order.id);
        return { ...order, status: 'PAID' as const };
      }

      if (intent.status === 'canceled') {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'CANCELLED' },
        });
        return { ...order, status: 'CANCELLED' as const };
      }
    } catch {
      // Stripe lookup failed — fall through with the DB status as-is.
    }
  }

  return order;
}

export async function confirmCheckoutService(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    select: {
      id: true,
      status: true,
      total: true,
      currency: true,
      stripe_payment_intent_id: true,
    },
  });

  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  if (order.status === 'PAID') return { ...order, status: 'PAID' as const };
  if (order.status !== 'PENDING') {
    throw new HttpError(409, `Order is ${order.status}, cannot confirm`, 'INVALID_STATUS');
  }
  if (!order.stripe_payment_intent_id || !stripe) {
    throw new HttpError(400, 'Order has no active payment intent', 'NO_PAYMENT_INTENT');
  }

  const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);

  if (intent.status === 'succeeded') {
    await finalizeOrderAsPaid(order.id);
    return { ...order, status: 'PAID' as const };
  }

  if (intent.status === 'canceled') {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });
    return { ...order, status: 'CANCELLED' as const };
  }

  return { ...order, status: intent.status as 'PENDING' };
}
