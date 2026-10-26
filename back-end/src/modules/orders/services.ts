import { prisma } from '../../libs/prisma.js';
import { stripe } from '../../libs/stripe.js';
import { HttpError } from '../../common/utils/errors.js';
import { reserveStock } from '../stock/services.js';
import { returnInfo } from '../returns/services.js';

export async function listOrdersService(userId: string) {
  const orders = await prisma.order.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: {
      order_item: {
        include: {
          variant_sync: { select: { id: true, stock: true, attributes: true, product_id: true, product_sync: { select: { main_image: true } } } },
        },
      },
      return_request: { orderBy: { created_at: 'desc' }, include: { return_item: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    total: Number(order.total),
    currency: order.currency,
    created_at: order.created_at,
    ...returnInfo(order),
    returns: order.return_request.map((r) => ({
      id: r.id,
      status: r.status,
      refund_amount: Number(r.refund_amount),
      admin_note: r.admin_note,
      created_at: r.created_at,
    })),
    items: order.order_item.map((item) => ({
      id: item.id,
      cart_item_id: item.cart_item_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price_snapshot: item.unit_price_snapshot,
      product_title_snapshot: item.product_title_snapshot,
      variant_attributes_snapshot: item.variant_attributes_snapshot,
      product_id: item.variant_sync.product_id,
      main_image: item.variant_sync.product_sync.main_image,
    })),
  }));
}

export async function getOrderService(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    include: {
      order_item: {
        include: {
          variant_sync: { select: { id: true, stock: true, attributes: true } },
        },
      },
    },
  });

  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');

  return {
    id: order.id,
    status: order.status,
    total: Number(order.total),
    currency: order.currency,
    shipping_address: order.shipping_address,
    created_at: order.created_at,
    updated_at: order.updated_at,
    stripe_payment_intent_id: order.stripe_payment_intent_id,
    items: order.order_item.map((item) => ({
      id: item.id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price_snapshot: item.unit_price_snapshot,
      product_title_snapshot: item.product_title_snapshot,
      variant_attributes_snapshot: item.variant_attributes_snapshot,
    })),
  };
}

export async function cancelOrderService(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    include: { order_item: { select: { id: true, cart_item_id: true } } },
  });

  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  if (order.status !== 'PENDING') {
    throw new HttpError(409, `Cannot cancel order in status ${order.status}`, 'INVALID_STATUS');
  }

  if (order.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(order.stripe_payment_intent_id);
    } catch (err) {
      throw new HttpError(502, `Stripe error: ${(err as Error).message}`, 'STRIPE_ERROR');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });

    const cartItemIds = order.order_item
      .map((item) => item.cart_item_id)
      .filter((id): id is string => Boolean(id));

    if (cartItemIds.length > 0) {
      const reservations = await tx.inventoryReservation.findMany({
        where: { cart_item_id: { in: cartItemIds } },
      });

      for (const reservation of reservations) {
        await tx.productVariant.update({
          where: { id: reservation.variant_id },
          data: { stock: { increment: reservation.quantity } },
        });
        await tx.inventoryReservation.delete({ where: { id: reservation.id } });
      }
    }
  });

  return { id: order.id, status: 'CANCELLED' as const };
}

export async function resumeOrderService(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    include: { order_item: true },
  });

  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  if (order.status !== 'PENDING') {
    throw new HttpError(409, `Cannot resume order in status ${order.status}`, 'INVALID_STATUS');
  }

  // Cancel the stale Stripe PaymentIntent (if any) so checkout creates a fresh one.
  if (order.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(order.stripe_payment_intent_id);
    } catch {
      // ignore — may already be terminal
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { stripe_payment_intent_id: null, stripe_client_secret: null },
    });
  }

  // Collect existing cart_item_ids that are still live (cart item still exists).
  const existingCartItemIds = order.order_item
    .map((item) => item.cart_item_id)
    .filter((id): id is string => Boolean(id));

  if (existingCartItemIds.length === order.order_item.length) {
    return { cart_item_ids: existingCartItemIds };
  }

  // Otherwise recreate missing cart items + reservations from the order snapshots.
  const cart = await prisma.cart.upsert({
    where: { user_id: userId },
    update: {},
    create: { user_id: userId },
  });

  const cartItemIds: string[] = [];
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const item of order.order_item) {
      if (item.cart_item_id) {
        const stillExists = await tx.cartItem.findUnique({
          where: { id: item.cart_item_id },
        });
        if (stillExists) {
          cartItemIds.push(item.cart_item_id);
          continue;
        }
      }

      await reserveStock(tx, item.variant_id, item.quantity, 'Insufficient stock to resume one or more items. Please refresh your cart.');

      const created = await tx.cartItem.create({
        data: {
          cart_id: cart.id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price_snapshot: item.unit_price_snapshot,
        },
      });

      await tx.inventoryReservation.create({
        data: {
          variant_id: item.variant_id,
          cart_item_id: created.id,
          quantity: item.quantity,
          expires_at: new Date(now.getTime() + 15 * 60 * 1000),
        },
      });

      await tx.orderItem.update({
        where: { id: item.id },
        data: { cart_item_id: created.id },
      });

      cartItemIds.push(created.id);
    }
  });

  return { cart_item_ids: cartItemIds };
}

const PENDING_ORDER_TTL_MIN = 30;

export async function cancelStalePendingOrdersService() {
  const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MIN * 60 * 1000);

  const staleOrders = await prisma.order.findMany({
    where: { status: 'PENDING', created_at: { lt: cutoff } },
    include: { order_item: { select: { id: true, cart_item_id: true } } },
  });

  if (staleOrders.length === 0) return { cancelled: 0 };

  let cancelled = 0;

  for (const order of staleOrders) {
    if (order.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(order.stripe_payment_intent_id);
      } catch {
        // ignore — may already be terminal
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
      });

      const cartItemIds = order.order_item
        .map((item) => item.cart_item_id)
        .filter((id): id is string => Boolean(id));

      if (cartItemIds.length > 0) {
        const reservations = await tx.inventoryReservation.findMany({
          where: { cart_item_id: { in: cartItemIds } },
        });

        for (const reservation of reservations) {
          await tx.productVariant.update({
            where: { id: reservation.variant_id },
            data: { stock: { increment: reservation.quantity } },
          });
          await tx.inventoryReservation.delete({ where: { id: reservation.id } });
        }
      }
    });

    cancelled += 1;
  }

  return { cancelled };
}