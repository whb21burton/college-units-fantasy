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
    .select('id, lifetime_deposited, lifetime_withdrawn')
    .eq('user_id', user.id)
    .single();

  if (walletErr?.code === 'PGRST116') {
    const { data: newWallet } = await admin
      .from('wallets')
      .insert({ user_id: user.id })
      .select('id, lifetime_deposited, lifetime_withdrawn')
      .single();
    wallet = newWallet;
  }

  if (!wallet) return NextResponse.json({ error: 'Failed to get wallet' }, { status: 500 });

  const [balanceRes, txRes] = await Promise.all([
    admin.rpc('get_wallet_balance', { p_wallet_id: wallet.id }),
    admin
      .from('transactions')
      .select('id, type, amount_cents, status, description, created_at, completed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const available = balanceRes.data?.[0]?.available_cents ?? 0;
  const pending   = balanceRes.data?.[0]?.pending_cents   ?? 0;

  return NextResponse.json({
    wallet: {
      id:                  wallet.id,
      balance:             available,
      available,
      pending,
      lifetime_deposited:  wallet.lifetime_deposited  ?? 0,
      lifetime_withdrawn:  wallet.lifetime_withdrawn  ?? 0,
    },
    transactions: (txRes.data ?? []).map(t => ({
      ...t,
      amount: t.amount_cents / 100,
    })),
  });
}
