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
    // Double-check the wallet was actually credited before skipping
    const { data: creditedTx } = await admin
      .from('transactions')
      .select('id')
      .eq('idempotency_key', `deposit_${(event.data.object as any).id}`)
      .eq('status', 'completed')
      .maybeSingle();

    // Only skip if ledger entry exists for this transaction
    if (creditedTx) {
      const { count } = await admin
        .from('ledger_entries')
        .select('id', { count: 'exact', head: true })
        .eq('transaction_id', creditedTx.id);

      if (count && count > 0) {
        return NextResponse.json({ received: true });
      }
    }
    // Otherwise fall through and reprocess
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
      const pi          = event.data.object as Stripe.PaymentIntent;
      const userId      = pi.metadata?.user_id;
      const walletId    = pi.metadata?.wallet_id;
      const amountCents = pi.metadata?.credit_amount_cents
        ? parseInt(pi.metadata.credit_amount_cents)
        : pi.amount;

      if (!userId || !walletId) {
        console.error('[webhook] missing metadata', pi.id);
      } else {
        // Check if already credited (ledger entry exists)
        const { data: completedTx } = await admin
          .from('transactions')
          .select('id')
          .eq('idempotency_key', `deposit_${pi.id}`)
          .eq('status', 'completed')
          .maybeSingle();

        const { data: existingEntry } = completedTx
          ? await admin.from('ledger_entries').select('id').eq('transaction_id', completedTx.id).maybeSingle()
          : { data: null };

        if (existingEntry) {
          console.log('[webhook] already credited, skipping', pi.id);
        } else {
          // Ensure ledger accounts exist
          const { data: accounts } = await admin
            .from('ledger_accounts')
            .select('id, type')
            .eq('wallet_id', walletId);

          let availId = accounts?.find(a => a.type === 'user_available')?.id;

          if (!availId) {
            const { data: newAcct } = await admin.from('ledger_accounts')
              .insert({ wallet_id: walletId, type: 'user_available', name: `${walletId}_available` })
              .select('id').single();
            availId = newAcct?.id;
          }

          const hasPending = accounts?.find(a => a.type === 'user_pending');
          if (!hasPending) {
            await admin.from('ledger_accounts')
              .insert({ wallet_id: walletId, type: 'user_pending', name: `${walletId}_pending` });
          }

          // Mark pending transaction as failed
          await admin.from('transactions')
            .update({ status: 'failed' })
            .eq('idempotency_key', `deposit_${pi.id}`)
            .eq('status', 'pending');

          // Create completed transaction
          const { data: tx } = await admin.from('transactions')
            .upsert({
              user_id:         userId,
              type:            'deposit',
              status:          'completed',
              amount_cents:    amountCents,
              idempotency_key: `deposit_${pi.id}`,
              description:     'Deposit via Stripe',
              completed_at:    new Date().toISOString(),
            }, { onConflict: 'idempotency_key' })
            .select('id').single();

          if (tx?.id && availId) {
            await admin.from('ledger_entries')
              .upsert({
                transaction_id:    tx.id,
                ledger_account_id: availId,
                amount_cents:      amountCents,
              }, { onConflict: 'transaction_id,ledger_account_id' });

            console.log('[webhook] credited', amountCents, 'to wallet', walletId);
          } else {
            console.error('[webhook] failed to insert tx or find availId', { txId: tx?.id, availId });
          }

          // Update deposit record
          await admin.from('deposits')
            .update({ status: 'succeeded', completed_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', pi.id);
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
