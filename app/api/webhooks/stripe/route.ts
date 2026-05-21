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
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = pi.metadata?.user_id;

      const { data: deposit } = await admin
        .from('deposits')
        .select('id, amount_cents')
        .eq('stripe_payment_intent_id', pi.id)
        .single();

      if (deposit && userId) {
        const { data: wallet } = await admin
          .from('wallets')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (wallet) {
          const [{ data: availAcct }, { data: clearingAcct }] = await Promise.all([
            admin.from('ledger_accounts').select('id').eq('wallet_id', wallet.id).eq('type', 'user_available').single(),
            admin.from('ledger_accounts').select('id').eq('name', 'stripe_clearing').single(),
          ]);

          if (availAcct && clearingAcct) {
            const { data: tx } = await admin
              .from('transactions')
              .select('id')
              .eq('idempotency_key', `deposit_${pi.id}`)
              .single();

            await admin.from('ledger_entries').insert([
              { transaction_id: tx?.id, ledger_account_id: clearingAcct.id, amount_cents: -deposit.amount_cents },
              { transaction_id: tx?.id, ledger_account_id: availAcct.id,    amount_cents:  deposit.amount_cents },
            ]);
          }
        }

        await admin.from('deposits')
          .update({ status: 'succeeded', completed_at: new Date().toISOString() })
          .eq('id', deposit.id);

        await admin.from('transactions')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('idempotency_key', `deposit_${pi.id}`);
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
