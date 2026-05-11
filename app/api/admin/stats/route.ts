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

  const [
    { count: totalUsers },
    { data: deposits },
    { data: withdrawals },
    { data: pendingWithdrawals },
    { data: rake },
  ] = await Promise.all([
    admin.from('users').select('*', { count: 'exact', head: true }),
    admin.from('deposits').select('amount_cents').eq('status', 'succeeded'),
    admin.from('withdrawals').select('amount_cents').eq('status', 'succeeded'),
    admin.from('withdrawals').select('amount_cents').eq('status', 'pending'),
    admin.from('ledger_entries')
      .select('amount_cents, ledger_accounts!inner(type)')
      .eq('ledger_accounts.type', 'platform_rake'),
  ]);

  const sum = (rows: any[] | null) => (rows ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);

  return NextResponse.json({
    total_users:                totalUsers ?? 0,
    total_deposits_cents:       sum(deposits),
    total_withdrawals_cents:    sum(withdrawals),
    pending_withdrawals_cents:  sum(pendingWithdrawals),
    platform_rake_cents:        sum(rake),
  });
}
