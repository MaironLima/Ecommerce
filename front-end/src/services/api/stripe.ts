import { loadStripe, type Stripe } from "@stripe/stripe-js";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.warn(
    "[stripe] VITE_STRIPE_PUBLISHABLE_KEY is not set; checkout will fail until configured.",
  );
}

export const isStripeTestMode = publishableKey?.startsWith("pk_test_") ?? false;

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey ?? "", { locale: "en" });
  }
  return stripePromise;
}