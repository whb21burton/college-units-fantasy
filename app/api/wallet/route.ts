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

  // Step 1: get ledger account IDs for this wallet
  const { data: accounts } = await admin
    .from('ledger_accounts')
    .select('id, type')
    .eq('wallet_id', wallet.id);

  const availableId = accounts?.find(a => a.type === 'user_available')?.id;
  const pendingId   = accounts?.find(a => a.type === 'user_pending')?.id;

  // Step 2: sum ledger entries per account
  let availableCents = 0;
  let pendingCents   = 0;

  if (availableId) {
    const { data: entries } = await admin
      .from('ledger_entries')
      .select('amount_cents')
      .eq('ledger_account_id', availableId);
    availableCents = entries?.reduce((sum, e) => sum + Number(e.amount_cents), 0) ?? 0;
  }

  if (pendingId) {
    const { data: entries } = await admin
      .from('ledger_entries')
      .select('amount_cents')
      .eq('ledger_account_id', pendingId);
    pendingCents = entries?.reduce((sum, e) => sum + Number(e.amount_cents), 0) ?? 0;
  }

  // Get transactions
  const { data: transactions } = await admin
    .from('transactions')
    .select('id, type, status, amount_cents, description, created_at, completed_at')
    .eq('user_id', user.id)
    .eq('status', 'completed')
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
