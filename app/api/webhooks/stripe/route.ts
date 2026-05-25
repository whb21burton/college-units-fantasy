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
          const amountCents = deposit?.amount_cents ?? pi.amount;

          // Get or create user_available ledger account for this wallet
          let availAcct = await admin
            .from('ledger_accounts')
            .select('id')
            .eq('wallet_id', walletId)
            .eq('type', 'user_available')
            .maybeSingle()
            .then(r => r.data);

          if (!availAcct) {
            await admin.from('ledger_accounts').insert([
              { wallet_id: walletId, type: 'user_available', name: 'Available' },
              { wallet_id: walletId, type: 'user_pending',   name: 'Pending' },
            ]);
            availAcct = await admin
              .from('ledger_accounts')
              .select('id')
              .eq('wallet_id', walletId)
              .eq('type', 'user_available')
              .single()
              .then(r => r.data);
          }

          if (availAcct) {
            // Find or create transaction
            let { data: tx } = await admin
              .from('transactions')
              .select('id')
              .eq('idempotency_key', `deposit_${pi.id}`)
              .maybeSingle();

            if (!tx) {
              const { data: newTx } = await admin
                .from('transactions')
                .insert({
                  user_id:                  userId,
                  type:                     'deposit',
                  status:                   'pending',
                  amount_cents:             amountCents,
                  stripe_payment_intent_id: pi.id,
                  description:              `Deposit $${(amountCents / 100).toFixed(2)}`,
                  idempotency_key:          `deposit_${pi.id}`,
                })
                .select('id')
                .single();
              tx = newTx;
            }

            // Credit available balance
            await admin.from('ledger_entries').insert({
              transaction_id:   tx?.id,
              ledger_account_id: availAcct.id,
              amount_cents:     amountCents,
            });

            console.log('[webhook] deposit credited:', amountCents, 'cents to wallet:', walletId);
          } else {
            console.error('[webhook] user_available ledger account not found for wallet:', walletId);
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
