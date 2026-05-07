// GET /api/wallet/balance
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: wallet } = await admin
    .from('wallets')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  const { data, error } = await admin.rpc('get_wallet_balance', { wallet_id: wallet.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const available = (data?.available ?? 0) as number;
  const pending   = (data?.pending   ?? 0) as number;
  const total     = (data?.total     ?? 0) as number;

  return NextResponse.json({
    available:      available / 100,
    pending:        pending   / 100,
    total:          total     / 100,
    availableCents: available,
    pendingCents:   pending,
  });
}
