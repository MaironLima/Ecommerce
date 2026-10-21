import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '../config/env.js';
import logger from '../common/utils/logger.js';

if (!STRIPE_SECRET_KEY) {
  logger.warn('stripe.not_configured', { event: 'stripe.not_configured' });
}

// Placeholder keeps the app (and tests) booting; Stripe calls fail explicitly until a real key is set.
export const stripe = new Stripe(STRIPE_SECRET_KEY || 'sk_test_missing', {
  apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
});