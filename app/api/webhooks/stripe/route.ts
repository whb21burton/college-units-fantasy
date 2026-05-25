// POST /api/webhooks/stripe
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const rawBody  = await req.text();
  const sig      = req.headers.get('stripe-signature') ?? '';
  const secret   = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Store event (idempotency guard)
  const { data: existing } = await admin
    .from('stripe_webhook_events')
    .select('id, processed')
    .eq('stripe_event_id', event.id)
    .single();

  if (existing?.processed) {
    return NextResponse.json({ received: true });
  }

  if (!existing) {
    await admin.from('stripe_webhook_events').insert({
      stripe_event_id: event.id,
      event_type:      event.type,
      payload:         event,
      processed:       false,
    });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi       = event.data.object as Stripe.PaymentIntent;
      const userId   = pi.metadata?.user_id;
      const walletId = pi.metadata?.wallet_id;

      if (!userId || !walletId) {
        console.error('[webhook] payment_intent.succeeded missing metadata:', pi.id);
      } else {
        // Check if already processed
        const { data: deposit } = await admin
          .from('deposits')
          .select('id, amount_cents, status')
          .eq('stripe_payment_intent_id', pi.id)
          .maybeSingle();

        if (deposit?.status === 'succeeded') {
          console.log('[webhook] deposit already succeeded, skipping:', pi.id);
        } else {
          // Use credit_amount_cents from metadata (deposit amount, not charge amount)
          const amountCents = pi.metadata?.credit_amount_cents
            ? parseInt(pi.metadata.credit_amount_cents)
            : (deposit?.amount_cents ?? pi.amount);

          // Mark any existing pending transaction for this PI as failed so credit_wallet can insert fresh
          await admin.from('transactions')
            .update({ status: 'failed' })
            .eq('idempotency_key', `deposit_${pi.id}`)
            .eq('status', 'pending');

          // Atomic credit via postgres function — creates ledger accounts if missing, idempotent
          console.log('[webhook] processing payment_intent.succeeded', pi.id, 'userId:', userId, 'amount:', amountCents);
          const { error: creditError } = await admin.rpc('credit_wallet', {
            p_user_id:         userId,
            p_amount_cents:    amountCents,
            p_type:            'deposit',
            p_description:     `Deposit via Stripe`,
            p_idempotency_key: `deposit_${pi.id}`,
          });

          if (creditError) {
            console.error('[webhook] credit_wallet failed:', creditError.message, creditError.code);
          } else {
            console.log('[webhook] credit_wallet SUCCESS — credited', amountCents, 'to wallet', walletId);
          }

          // Update deposit and transaction status
          if (deposit) {
            await admin.from('deposits')
              .update({ status: 'succeeded', completed_at: new Date().toISOString() })
              .eq('id', deposit.id);
          }

          await admin.from('transactions')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('idempotency_key', `deposit_${pi.id}`);
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;

      const { data: deposit } = await admin
        .from('deposits')
        .select('id')
        .eq('stripe_payment_intent_id', pi.id)
        .single();

      if (deposit) {
        await admin.from('deposits').update({ status: 'failed' }).eq('id', deposit.id);
        await admin.from('transactions')
          .update({ status: 'failed' })
          .eq('idempotency_key', `deposit_${pi.id}`);
      }
    }

    if (event.type === 'payout.paid') {
      const payout = event.data.object as Stripe.Payout
      console.log('[webhook] payout.paid:', payout.id, payout.amount)
    }

    // Mark processed
    await admin.from('stripe_webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('stripe_event_id', event.id);

  } catch (err: any) {
    console.error('[stripe-webhook] processing error:', err);
    // Still return 200 to Stripe so it doesn't retry
  }

  return NextResponse.json({ received: true });
}
