import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/withdraw
 * Body: { amount: number }  (dollars)
 *
 * Requires the user to have a connected Stripe account (stripe_account_id).
 * Deducts from withdrawable_balance and initiates a Stripe Transfer + Payout.
 *
 * NOTE: Full Stripe Connect onboarding (account creation + bank link) is
 * handled separately via /api/wallet/connect-onboard.
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const amount = Number(body.amount);
  if (!amount || amount < 10) {
    return NextResponse.json({ error: 'Minimum withdrawal is $10' }, { status: 400 });
  }

  // Use service-role to read wallet (bypasses RLS for balance check)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: wallet } = await admin
    .from('wallets')
    .select('withdrawable_balance, stripe_account_id')
    .eq('user_id', user.id)
    .single();

  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
  if ((wallet.withdrawable_balance ?? 0) < amount) {
    return NextResponse.json({ error: 'Insufficient withdrawable balance' }, { status: 400 });
  }
  if (!wallet.stripe_account_id) {
    return NextResponse.json({
      error: 'Bank account not connected. Please connect your bank account first.',
      code:  'NO_STRIPE_ACCOUNT',
    }, { status: 400 });
  }

  // Debit wallet atomically via DB function
  const { error: debitError } = await admin.rpc('wallet_debit', {
    p_user_id:    user.id,
    p_amount:     amount,
    p_type:       'withdrawal',
    p_description: `Withdrawal to bank`,
  });
  if (debitError) return NextResponse.json({ error: debitError.message }, { status: 500 });

  // Also deduct from withdrawable_balance (wallet_debit only touches balance)
  await admin
    .from('wallets')
    .update({
      withdrawable_balance: wallet.withdrawable_balance - amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  // Stripe: transfer to connected account, then auto-payout
  try {
    const transfer = await stripe.transfers.create({
      amount:      Math.round(amount * 100),
      currency:    'usd',
      destination: wallet.stripe_account_id,
      metadata:    { supabase_user_id: user.id },
    });

    await admin
      .from('transactions')
      .update({ stripe_transfer_id: transfer.id, status: 'completed' })
      .eq('user_id', user.id)
      .eq('type', 'withdrawal')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1);

    return NextResponse.json({ success: true, transfer_id: transfer.id });
  } catch (err: any) {
    // Stripe failed — refund the debit
    await admin.rpc('wallet_credit', {
      p_user_id:       user.id,
      p_amount:        amount,
      p_type:          'refund',
      p_description:   'Withdrawal failed — refunded',
      p_withdrawable:  true,
    });
    return NextResponse.json({ error: 'Stripe payout failed: ' + err.message }, { status: 500 });
  }
}
