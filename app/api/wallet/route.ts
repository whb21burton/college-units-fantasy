import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Get or auto-create wallet
  let { data: wallet, error: walletErr } = await admin
    .from('wallets')
    .select('id, stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (walletErr?.code === 'PGRST116') {
    const { data: newWallet } = await admin
      .from('wallets')
      .insert({ user_id: user.id })
      .select('id, stripe_customer_id')
      .single();
    wallet = newWallet;
  }

  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  // Compute balance directly from ledger entries
  const { data: ledgerRows } = await admin
    .from('ledger_entries')
    .select('amount_cents, ledger_accounts(type)')
    .eq('ledger_accounts.wallet_id', wallet.id);

  let availableCents = 0;
  let pendingCents   = 0;
  for (const row of ledgerRows ?? []) {
    const type = (row.ledger_accounts as any)?.type;
    if (type === 'user_available') availableCents += Number(row.amount_cents);
    if (type === 'user_pending')   pendingCents   += Number(row.amount_cents);
  }

  // Get transactions
  const { data: transactions } = await admin
    .from('transactions')
    .select('id, type, status, amount_cents, description, created_at, completed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({
    wallet: {
      id:        wallet.id,
      balance:   availableCents,
      available: availableCents,
      pending:   pendingCents,
    },
    transactions: transactions ?? [],
  });
}
