import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ADMIN_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID;

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();

  const { data: withdrawals, error } = await admin
    .from('withdrawals')
    .select(`
      *,
      wallets!inner(id, user_id),
      auth_users:user_id(email)
    `)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch balances for each wallet
  const results = await Promise.all(
    (withdrawals ?? []).map(async (w: any) => {
      const walletId = w.wallets?.id;
      let available_cents = 0;
      if (walletId) {
        const { data: bal } = await admin.rpc('get_wallet_balance', { wallet_id: walletId });
        available_cents = bal?.available ?? 0;
      }
      return {
        ...w,
        email: w.auth_users?.email ?? w.user_id,
        available_cents,
      };
    })
  );

  return NextResponse.json({ withdrawals: results });
}
