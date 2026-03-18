import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 *
 * Handles checkout.session.completed for wallet deposits.
 * All amounts are in CENTS (integer).
 */
export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── checkout.session.completed ────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const type    = session.metadata?.type ?? 'deposit';

    if (type === 'deposit') {
      const userId      = session.metadata?.user_id;
      const amountCents = Math.round(Number(session.metadata?.amount_cents));

      if (!userId || !amountCents) {
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

      // Idempotency: skip if already processed
      if (paymentIntentId) {
        const { data: existing } = await admin
          .from('transactions')
          .select('id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .eq('status', 'completed')
          .single();
        if (existing) return NextResponse.json({ received: true });
      }

      // Read current balance
      const { data: wallet } = await admin
        .from('wallets')
        .select('balance, lifetime_deposited')
        .eq('user_id', userId)
        .single();

      const balanceBefore = wallet?.balance ?? 0;
      const balanceAfter  = balanceBefore + amountCents;

      // Credit wallet
      await admin
        .from('wallets')
        .upsert({
          user_id:            userId,
          balance:            balanceAfter,
          lifetime_deposited: (wallet?.lifetime_deposited ?? 0) + amountCents,
          updated_at:         new Date().toISOString(),
        }, { onConflict: 'user_id' });

      // Record completed transaction
      await admin.from('transactions').insert({
        user_id:                  userId,
        type:                     'deposit',
        amount:                   amountCents,
        balance_before:           balanceBefore,
        balance_after:            balanceAfter,
        stripe_payment_intent_id: paymentIntentId,
        status:                   'completed',
        description:              `Deposit via Stripe`,
      });
    }
  }

  return NextResponse.json({ received: true });
}
