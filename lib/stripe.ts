import Stripe from 'stripe';

/** Platform fee percentage (e.g. 0.09 = 9%) */
export const PLATFORM_FEE_RATE = 0.09;

/** Compute platform fee and payout from an entry fee */
export function splitEntryFee(entryFee: number): { fee: number; payout: number } {
  const fee    = Math.round(entryFee * PLATFORM_FEE_RATE * 100) / 100;
  const payout = Math.round((entryFee - fee) * 100) / 100;
  return { fee, payout };
}

// Lazy singleton — only instantiated on first request so the build never
// throws even when STRIPE_SECRET_KEY is absent from the build environment.
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    });
  }
  return _stripe;
}

// Proxy keeps the existing `import { stripe }` call-sites unchanged.
export const stripe = new Proxy({} as Stripe, {
  get(_: Stripe, prop: string | symbol) {
    return (getStripe() as any)[prop];
  },
});
