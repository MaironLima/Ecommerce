import { Request, Response } from 'express';
import type Stripe from 'stripe';
import { stripe } from '../../../libs/stripe.js';
import { STRIPE_WEBHOOK_SECRET } from '../../../config/env.js';
import { prisma } from '../../../libs/prisma.js';
import logger from '../../../common/utils/logger.js';
import { finalizeOrderAsPaid } from '../../checkout/services.js';

const processedEvents = new Set<string>();

export const stripeWebhookController = async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];
  const isDevBypass =
    process.env.NODE_ENV !== 'production' && STRIPE_WEBHOOK_SECRET === 'dev';

  if (!isDevBypass) {
    if (!signature || typeof signature !== 'string') {
      return res.status(400).send('Missing stripe-signature header');
    }
    if (!STRIPE_WEBHOOK_SECRET) {
      logger.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook not configured');
    }
    if (!stripe) {
      return res.status(500).send('Stripe not configured');
    }
  }

  let event: Stripe.Event;
  if (isDevBypass) {
    const raw = (req as Request & { body: any }).body;
    event = (
      typeof raw === 'string'
        ? JSON.parse(raw)
        : Buffer.isBuffer(raw)
          ? JSON.parse(raw.toString('utf8'))
          : raw
    ) as Stripe.Event;
    logger.warn('[stripe-webhook] DEV bypass active — signature verification skipped');
  } else {
    try {
      event = stripe.webhooks.constructEvent(
        (req as Request & { body: Buffer }).body,
        signature as string,
        STRIPE_WEBHOOK_SECRET as string,
      );
    } catch (err: any) {
      logger.error(`[stripe-webhook] signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  if (processedEvents.has(event.id)) {
    res.json({ received: true, duplicate: true });
    return;
  }
  processedEvents.add(event.id);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        logger.info(`[stripe-webhook] unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    logger.error(`[stripe-webhook] handler error for ${event.type}: ${err.message}`);
    processedEvents.delete(event.id);
    res.status(500).send('Webhook handler error');
  }
};

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const orderId = intent.metadata?.order_id;
  if (!orderId) {
    logger.warn('[stripe-webhook] payment_intent.succeeded missing order_id metadata', {
      intent_id: intent.id,
    });
    return;
  }

  await finalizeOrderAsPaid(orderId);
  logger.info(`[stripe-webhook] order ${orderId} marked PAID`);
}

async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
  const orderId = intent.metadata?.order_id;
  if (!orderId) return;

  await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });

  logger.info(`[stripe-webhook] order ${orderId} marked FAILED`);
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string | null;
  if (!paymentIntentId) return;

  const order = await prisma.order.findFirst({
    where: { stripe_payment_intent_id: paymentIntentId },
  });

  if (!order) {
    logger.warn(`[stripe-webhook] no order for payment intent ${paymentIntentId}`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'REFUNDED' },
  });

  logger.info(`[stripe-webhook] order ${order.id} marked REFUNDED`);
}