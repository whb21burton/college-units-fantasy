import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** GET /api/wallet — returns wallet balance + recent transactions */
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [walletRes, txRes] = await Promise.all([
    supabase
      .from('wallets')
      .select('balance, pending_balance, withdrawable_balance')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('transactions')
      .select('id, type, amount, status, description, league_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Auto-create wallet if missing (for users who signed up before migration)
  if (walletRes.error?.code === 'PGRST116') {
    await supabase.from('wallets').insert({ user_id: user.id });
    return NextResponse.json({
      wallet: { balance: 0, pending_balance: 0, withdrawable_balance: 0 },
      transactions: [],
    });
  }

  return NextResponse.json({
    wallet: walletRes.data,
    transactions: txRes.data ?? [],
  });
}
