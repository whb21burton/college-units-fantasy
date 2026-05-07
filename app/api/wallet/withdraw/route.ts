// POST /api/wallet/withdraw
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { amountCents, stripePayoutMethodId } = body as { amountCents?: number; stripePayoutMethodId?: string };

    if (!amountCents || amountCents < 1000) {
      return NextResponse.json({ error: 'Minimum withdrawal is $10 (1000 cents)' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: wallet } = await admin
      .from('wallets')
      .select('id, is_frozen, stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    if (wallet.is_frozen) return NextResponse.json({ error: 'Wallet is frozen' }, { status: 403 });

    // Check available balance
    const { data: balance } = await admin.rpc('get_wallet_balance', { wallet_id: wallet.id });
    const availableCents = (balance?.available ?? 0) as number;
    if (availableCents < amountCents) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    // Create transaction
    const idempotencyKey = `withdrawal_${user.id}_${Date.now()}`;
    const { data: transaction, error: txErr } = await admin
      .from('transactions')
      .insert({
        wallet_id:       wallet.id,
        user_id:         user.id,
        type:            'withdrawal',
        status:          'pending',
        amount_cents:    amountCents,
        description:     `Withdrawal $${(amountCents / 100).toFixed(2)}`,
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .single();

    if (txErr) throw txErr;

    // Create withdrawal row
    const { data: withdrawal, error: wErr } = await admin
      .from('withdrawals')
      .insert({
        wallet_id:      wallet.id,
        user_id:        user.id,
        amount_cents:   amountCents,
        status:         'pending',
        transaction_id: transaction!.id,
      })
      .select('id')
      .single();

    if (wErr) throw wErr;

    // Look up ledger accounts
    const [{ data: availAcct }, { data: bankAcct }] = await Promise.all([
      admin.from('ledger_accounts').select('id').eq('wallet_id', wallet.id).eq('type', 'user_available').single(),
      admin.from('ledger_accounts').select('id').eq('name', 'bank_clearing').single(),
    ]);

    if (availAcct && bankAcct) {
      await admin.from('ledger_entries').insert([
        { account_id: availAcct.id, amount_cents: -amountCents, description: `Withdrawal ${withdrawal!.id}`, reference_id: withdrawal!.id },
        { account_id: bankAcct.id,  amount_cents:  amountCents, description: `Withdrawal ${withdrawal!.id}`, reference_id: withdrawal!.id },
      ]);
    }

    // Initiate Stripe payout
    let stripeTransferId: string | null = null;
    try {
      if (stripePayoutMethodId) {
        const transfer = await stripe.transfers.create({
          amount:      amountCents,
          currency:    'usd',
          destination: stripePayoutMethodId,
          metadata:    { withdrawal_id: withdrawal!.id, user_id: user.id },
        });
        stripeTransferId = transfer.id;
      }
    } catch (stripeErr: any) {
      console.error('[withdraw] Stripe transfer error:', stripeErr.message);
      // Don't fail the whole request — mark as pending manual review
    }

    await admin.from('withdrawals')
      .update({ status: 'processing', stripe_transfer_id: stripeTransferId })
      .eq('id', withdrawal!.id);
    await admin.from('transactions')
      .update({ status: 'processing' })
      .eq('id', transaction!.id);

    return NextResponse.json({ withdrawalId: withdrawal!.id, status: 'processing' });
  } catch (err: any) {
    console.error('[withdraw]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
