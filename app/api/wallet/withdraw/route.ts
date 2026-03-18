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
 * Requires profiles.stripe_connect_account_id (set via /api/stripe/connect/onboard).
 * Deducts from wallet and initiates a Stripe Transfer.
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

    // Load wallet + connect account from profile
    const [{ data: wallet }, { data: profile }] = await Promise.all([
      admin.from('wallets').select('balance, lifetime_withdrawn').eq('user_id', user.id).single(),
      admin.from('profiles').select('stripe_connect_account_id').eq('id', user.id).single(),
    ]);

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

    if ((wallet.balance ?? 0) < amount_cents) {
      return NextResponse.json({
        error: `Insufficient balance. Have $${(wallet.balance / 100).toFixed(2)}, requested $${(amount_cents / 100).toFixed(2)}.`,
      }, { status: 400 });
    }

    if (!profile?.stripe_connect_account_id) {
      return NextResponse.json({
        error: 'Bank account not connected. Please connect your bank account first.',
        code:  'NO_STRIPE_ACCOUNT',
      }, { status: 400 });
    }

    const balanceAfter = wallet.balance - amount_cents;

    // Deduct wallet first
    await admin
      .from('wallets')
      .update({
        balance:            balanceAfter,
        lifetime_withdrawn: (wallet.lifetime_withdrawn ?? 0) + amount_cents,
        updated_at:         new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Insert pending transaction
    const { data: tx } = await admin
      .from('transactions')
      .insert({
        user_id:        user.id,
        type:           'withdrawal',
        amount:         amount_cents,
        balance_before: wallet.balance,
        balance_after:  balanceAfter,
        status:         'pending',
        description:    'Withdrawal to bank',
      })
      .select('id')
      .single();

    // Stripe Transfer
    try {
      const transfer = await stripe.transfers.create({
        amount:      amount_cents,
        currency:    'usd',
        destination: profile.stripe_connect_account_id,
        metadata:    { user_id: user.id },
      });

      await admin
        .from('transactions')
        .update({ stripe_transfer_id: transfer.id, status: 'completed' })
        .eq('id', tx?.id);

      return NextResponse.json({ success: true, transfer_id: transfer.id });
    } catch (stripeErr: any) {
      // Refund wallet on Stripe failure
      await admin
        .from('wallets')
        .update({
          balance:            wallet.balance,
          lifetime_withdrawn: wallet.lifetime_withdrawn ?? 0,
          updated_at:         new Date().toISOString(),
        })
        .eq('user_id', user.id);

      await admin
        .from('transactions')
        .update({ status: 'failed' })
        .eq('id', tx?.id);

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
