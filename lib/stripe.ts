import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover',
});

/** Platform fee percentage (e.g. 0.09 = 9%) */
export const PLATFORM_FEE_RATE = 0.09;

/** Compute platform fee and payout from an entry fee */
export function splitEntryFee(entryFee: number): { fee: number; payout: number } {
  const fee    = Math.round(entryFee * PLATFORM_FEE_RATE * 100) / 100;
  const payout = Math.round((entryFee - fee) * 100) / 100;
  return { fee, payout };
}
