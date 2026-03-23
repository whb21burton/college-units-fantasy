import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 *
 * checkout.session.completed  → call add_balance RPC, complete transaction
 * checkout.session.expired    → mark transaction failed
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
    console.error('[webhook] signature failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (event.type === 'checkout.session.completed') {
    const session       = event.data.object as Stripe.Checkout.Session;
    const userId        = session.metadata?.user_id;
    const transactionId = session.metadata?.transaction_id;
    const amountCents   = Math.round(Number(session.metadata?.amount_cents));

    if (!userId || !amountCents) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
    }

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

    // Idempotency
    if (paymentIntentId) {
      const { data: existing } = await admin
        .from('transactions')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .eq('status', 'completed')
        .single();
      if (existing) return NextResponse.json({ received: true });
    }

    // Get balance before crediting
    const { data: walletBefore } = await admin
      .from('wallets')
      .select('balance, lifetime_deposited')
      .eq('user_id', userId)
      .single();

    const balanceBefore = walletBefore?.balance ?? 0;

    // Credit wallet atomically
    const { data: newBalance, error: rpcErr } = await admin
      .rpc('add_balance', { p_user_id: userId, p_amount: amountCents });

    if (rpcErr) {
      console.error('[webhook] add_balance failed:', rpcErr);
      return NextResponse.json({ error: 'Balance update failed' }, { status: 500 });
    }

    const balanceAfter = (newBalance as number);

    // Also bump lifetime_deposited
    await admin
      .from('wallets')
      .update({
        lifetime_deposited: (walletBefore?.lifetime_deposited ?? 0) + amountCents,
      })
      .eq('user_id', userId);

    // Update or insert transaction
    if (transactionId) {
      await admin
        .from('transactions')
        .update({
          status:                   'completed',
          balance_before:           balanceBefore,
          balance_after:            balanceAfter,
          stripe_payment_intent_id: paymentIntentId,
        })
        .eq('id', transactionId);
    } else {
      await admin.from('transactions').insert({
        user_id:                  userId,
        type:                     'deposit',
        amount:                   amountCents,
        balance_before:           balanceBefore,
        balance_after:            balanceAfter,
        stripe_payment_intent_id: paymentIntentId,
        status:                   'completed',
        description:              'Deposit via Stripe',
      });
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session       = event.data.object as Stripe.Checkout.Session;
    const transactionId = session.metadata?.transaction_id;
    if (transactionId) {
      await admin
        .from('transactions')
        .update({ status: 'failed' })
        .eq('id', transactionId)
        .eq('status', 'pending');
    }
  }

  return NextResponse.json({ received: true });
}
