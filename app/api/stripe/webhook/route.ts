import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 *
 * Handles two checkout.session.completed flows, distinguished by metadata.checkout_type:
 *
 *  'deposit'      → credit user wallet (original flow)
 *  'league_entry' → add user to league_members and mark paid=true
 *
 * Also handles payment_intent.payment_failed → mark transaction failed.
 *
 * Register this URL in Stripe Dashboard → Webhooks (or via `stripe listen` locally).
 */
export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Service-role client — bypasses RLS
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── checkout.session.completed ────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session      = event.data.object as Stripe.Checkout.Session;
    const checkoutType = session.metadata?.checkout_type ?? 'deposit';

    // ── wallet deposit ──────────────────────────────────────────────────────
    if (checkoutType === 'deposit') {
      const userId = session.metadata?.supabase_user_id;
      const amount = Number(session.metadata?.deposit_amount);

      if (!userId || !amount) {
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      // Idempotency: skip if already processed
      const { data: existing } = await admin
        .from('transactions')
        .select('id')
        .eq('stripe_checkout_session_id', session.id)
        .eq('status', 'completed')
        .single();

      if (!existing) {
        await admin.rpc('wallet_credit', {
          p_user_id:     userId,
          p_amount:      amount,
          p_type:        'deposit',
          p_description: `Deposit via Stripe (${session.id})`,
          p_withdrawable: false,
        });

        await admin
          .from('transactions')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('stripe_checkout_session_id', session.id)
          .eq('status', 'pending');
      }
    }

    // ── league entry ────────────────────────────────────────────────────────
    if (checkoutType === 'league_entry') {
      const leagueId  = session.metadata?.league_id;
      const userId    = session.metadata?.user_id;
      const teamName  = session.metadata?.team_name;
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

      if (!leagueId || !userId || !teamName) {
        return NextResponse.json({ error: 'Missing league_entry metadata' }, { status: 400 });
      }

      // Idempotency: skip if member already marked paid
      const { data: member } = await admin
        .from('league_members')
        .select('id, paid')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .single();

      if (member?.paid) {
        return NextResponse.json({ received: true });
      }

      if (member) {
        // Member row already exists (e.g. pre-created) — just mark paid
        await admin
          .from('league_members')
          .update({
            paid:                     true,
            stripe_payment_intent_id: paymentIntentId,
          })
          .eq('id', member.id);
      } else {
        // Count existing members to assign draft_slot
        const { count } = await admin
          .from('league_members')
          .select('*', { count: 'exact', head: true })
          .eq('league_id', leagueId);

        await admin.from('league_members').insert({
          league_id:                leagueId,
          user_id:                  userId,
          team_name:                teamName,
          draft_slot:               (count ?? 0) + 1,
          paid:                     true,
          stripe_payment_intent_id: paymentIntentId,
        });
      }
    }
  }

  // ── payment_intent.payment_failed ─────────────────────────────────────────
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent;
    await admin
      .from('transactions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', pi.id)
      .eq('status', 'pending');
  }

  return NextResponse.json({ received: true });
}
