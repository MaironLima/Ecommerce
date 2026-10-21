import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '../config/env.js';
import logger from '../common/utils/logger.js';

// Portfolio store: test mode only, even in production. A live key must never charge real cards.
if (STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
  throw new Error('STRIPE_SECRET_KEY is a live key; this store runs in Stripe test mode only (use sk_test_...).');
}

if (!STRIPE_SECRET_KEY) {
  logger.warn('stripe.not_configured', { event: 'stripe.not_configured' });
}

// Placeholder keeps the app (and tests) booting; Stripe calls fail explicitly until a real key is set.
export const stripe = new Stripe(STRIPE_SECRET_KEY || 'sk_test_missing', {
  apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
});