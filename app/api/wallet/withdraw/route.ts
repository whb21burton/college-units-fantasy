import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/withdraw
 * Body: { amount_cents: number }  (integer cents, minimum 1000)
 *
 * 1. Checks stripe_connect_onboarded — returns { requiresOnboarding: true } if not set up
 * 2. Calls deduct_balance RPC atomically
 * 3. Creates Stripe Transfer to connect account
 * 4. On Stripe error: refunds via add_balance, marks transaction failed
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const amount_cents = Math.round(Number(body.amount_cents));

    if (!amount_cents || amount_cents < 1000) {
      return NextResponse.json({ error: 'Minimum withdrawal is $10' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Load wallet + profile
    const [{ data: wallet }, { data: profile }] = await Promise.all([
      admin.from('wallets').select('balance, lifetime_withdrawn').eq('user_id', user.id).single(),
      admin.from('profiles').select('stripe_connect_account_id, stripe_connect_onboarded').eq('id', user.id).single(),
    ]);

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

    // Check onboarding
    if (!profile?.stripe_connect_account_id || !profile?.stripe_connect_onboarded) {
      return NextResponse.json({ requiresOnboarding: true, error: 'Bank account not connected' }, { status: 400 });
    }

    if ((wallet.balance ?? 0) < amount_cents) {
      return NextResponse.json({
        error: `Insufficient balance. Have $${((wallet.balance ?? 0) / 100).toFixed(2)}, need $${(amount_cents / 100).toFixed(2)}.`,
      }, { status: 400 });
    }

    // Atomically deduct
    const { data: newBalance, error: rpcErr } = await admin
      .rpc('deduct_balance', { p_user_id: user.id, p_amount: amount_cents });

    if (rpcErr) {
      if (rpcErr.message?.includes('INSUFFICIENT_BALANCE')) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
      throw rpcErr;
    }

    const balanceAfter = newBalance as number;

    // Create pending transaction
    const { data: tx } = await admin
      .from('transactions')
      .insert({
        user_id:        user.id,
        type:           'withdrawal',
        amount:         amount_cents,
        balance_before: wallet.balance,
        balance_after:  balanceAfter,
        status:         'pending',
        description:    `Withdrawal to bank`,
      })
      .select('id')
      .single();

    // Stripe Transfer
    try {
      const transfer = await stripe.transfers.create({
        amount:      amount_cents,
        currency:    'usd',
        destination: profile.stripe_connect_account_id,
        metadata:    { user_id: user.id, transaction_id: tx?.id ?? '' },
      });

      await Promise.all([
        admin.from('transactions').update({
          stripe_transfer_id: transfer.id,
          status:             'completed',
        }).eq('id', tx?.id),
        admin.from('wallets').update({
          lifetime_withdrawn: (wallet.lifetime_withdrawn ?? 0) + amount_cents,
          updated_at:         new Date().toISOString(),
        }).eq('user_id', user.id),
      ]);

      return NextResponse.json({ success: true, newBalance: balanceAfter, transfer_id: transfer.id });
    } catch (stripeErr: any) {
      // Refund wallet
      await admin.rpc('add_balance', { p_user_id: user.id, p_amount: amount_cents });
      await admin.from('transactions').update({ status: 'failed' }).eq('id', tx?.id);

      return NextResponse.json(
        { error: 'Stripe transfer failed: ' + stripeErr.message },
        { status: 500 },
      );
    }
  } catch (err: any) {
    console.error('[withdraw]', err);
    return NextResponse.json({ error: err?.message ?? 'Withdrawal failed' }, { status: 500 });
  }
}
