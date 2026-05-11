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

  const { data: wallets, error } = await admin
    .from('wallets')
    .select('id, user_id, created_at, auth_users:user_id(email, created_at)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = await Promise.all(
    (wallets ?? []).map(async (w: any) => {
      const [{ data: bal }, { data: deps }, { data: wds }] = await Promise.all([
        admin.rpc('get_wallet_balance', { wallet_id: w.id }),
        admin.from('deposits').select('amount_cents').eq('wallet_id', w.id).eq('status', 'succeeded'),
        admin.from('withdrawals').select('amount_cents').eq('wallet_id', w.id).eq('status', 'succeeded'),
      ]);
      const sum = (rows: any[] | null) => (rows ?? []).reduce((s: number, r: any) => s + (r.amount_cents ?? 0), 0);
      return {
        user_id:           w.user_id,
        email:             w.auth_users?.email ?? w.user_id,
        joined:            w.auth_users?.created_at ?? w.created_at,
        available_cents:   bal?.available ?? 0,
        total_deposited_cents:  sum(deps),
        total_withdrawn_cents:  sum(wds),
      };
    })
  );

  return NextResponse.json({ users: users.sort((a, b) => b.available_cents - a.available_cents) });
}
