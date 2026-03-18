import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** GET /api/wallet — returns wallet balance + recent transactions.
 *  All amounts returned in CENTS (integer). */
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [walletRes, txRes] = await Promise.all([
    supabase
      .from('wallets')
      .select('balance, lifetime_deposited, lifetime_withdrawn')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('transactions')
      .select('id, type, amount, balance_before, balance_after, status, description, league_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Auto-create wallet if missing
  if (walletRes.error?.code === 'PGRST116') {
    await supabase.from('wallets').insert({ user_id: user.id });
    return NextResponse.json({
      wallet: { balance: 0, lifetime_deposited: 0, lifetime_withdrawn: 0 },
      transactions: [],
    });
  }

  return NextResponse.json({
    wallet:       walletRes.data,
    transactions: txRes.data ?? [],
  });
}
