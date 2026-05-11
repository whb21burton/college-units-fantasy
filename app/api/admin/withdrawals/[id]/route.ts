import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

const ADMIN_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { action, reason } = await req.json() as { action: 'approve' | 'reject'; reason?: string };
  const admin = createAdminClient();

  const { data: withdrawal } = await admin
    .from('withdrawals')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!withdrawal) return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });
  if (withdrawal.status !== 'pending') return NextResponse.json({ error: 'Withdrawal already processed' }, { status: 400 });

  if (action === 'approve') {
    // Re-check balance
    const { data: wallet } = await admin.from('wallets').select('id').eq('user_id', withdrawal.user_id).single();
    if (wallet) {
      const { data: bal } = await admin.rpc('get_wallet_balance', { wallet_id: wallet.id });
      if ((bal?.available ?? 0) < withdrawal.amount_cents) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }
    }

    // Stripe payout
    let stripePayoutId: string | null = null;
    try {
      const payout = await stripe.payouts.create({
        amount:   withdrawal.amount_cents,
        currency: 'usd',
        metadata: { withdrawal_id: withdrawal.id },
      });
      stripePayoutId = payout.id;
    } catch (err: any) {
      console.error('[admin/withdraw/approve] Stripe payout error:', err.message);
    }

    // Bank clearing ledger debit
    const { data: bankAcct } = await admin.from('ledger_accounts').select('id').eq('name', 'bank_clearing').single();
    if (bankAcct) {
      await admin.from('ledger_entries').insert({
        account_id:   bankAcct.id,
        amount_cents: -withdrawal.amount_cents,
        description:  `Withdrawal approved ${withdrawal.id}`,
        reference_id: withdrawal.id,
      });
    }

    await Promise.all([
      admin.from('withdrawals').update({
        status:             'succeeded',
        stripe_transfer_id: stripePayoutId,
        processed_at:       new Date().toISOString(),
      }).eq('id', withdrawal.id),
      admin.from('transactions').update({
        status:       'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', withdrawal.transaction_id),
    ]);

    return NextResponse.json({ success: true, status: 'succeeded' });
  }

  if (action === 'reject') {
    // Reverse ledger: give money back to user
    const { data: wallet } = await admin.from('wallets').select('id').eq('user_id', withdrawal.user_id).single();
    if (wallet) {
      const [{ data: availAcct }, { data: bankAcct }] = await Promise.all([
        admin.from('ledger_accounts').select('id').eq('wallet_id', wallet.id).eq('type', 'user_available').single(),
        admin.from('ledger_accounts').select('id').eq('name', 'bank_clearing').single(),
      ]);
      if (availAcct && bankAcct) {
        await admin.from('ledger_entries').insert([
          { account_id: availAcct.id, amount_cents:  withdrawal.amount_cents, description: `Withdrawal reversed ${withdrawal.id}`, reference_id: withdrawal.id },
          { account_id: bankAcct.id,  amount_cents: -withdrawal.amount_cents, description: `Withdrawal reversed ${withdrawal.id}`, reference_id: withdrawal.id },
        ]);
      }
    }

    await Promise.all([
      admin.from('withdrawals').update({ status: 'failed', failure_reason: reason ?? 'Rejected by admin' }).eq('id', withdrawal.id),
      admin.from('transactions').update({ status: 'reversed' }).eq('id', withdrawal.transaction_id),
    ]);

    return NextResponse.json({ success: true, status: 'failed' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
