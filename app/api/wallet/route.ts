import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** GET /api/wallet — returns wallet balance + recent transactions.
 *  Delegates balance computation to get_wallet_balance RPC when available,
 *  falling back to the legacy `balance` column. */
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const [walletRes, txRes] = await Promise.all([
    admin
      .from('wallets')
      .select('balance, lifetime_deposited, lifetime_withdrawn')
      .eq('user_id', user.id)
      .single(),
    admin
      .from('transactions')
      .select('id, type, amount_cents, status, description, created_at, completed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Auto-create wallet if missing
  if (walletRes.error?.code === 'PGRST116') {
    await admin.from('wallets').insert({ user_id: user.id });
    return NextResponse.json({
      wallet:       { balance: 0, lifetime_deposited: 0, lifetime_withdrawn: 0 },
      transactions: [],
    });
  }

  return NextResponse.json({
    wallet:       walletRes.data,
    transactions: (txRes.data ?? []).map(t => ({
      ...t,
      amount: t.amount_cents / 100,
    })),
  });
}
