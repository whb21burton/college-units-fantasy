import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();

    const { data: league } = await admin
      .from('leagues')
      .select('commissioner_id, name')
      .eq('id', params.id)
      .single();

    const isAdmin = user.email === ADMIN_EMAIL;
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    console.log('[DELETE league] id:', params.id, 'user:', user.id, 'commissioner_id:', league.commissioner_id, 'isAdmin:', isAdmin);

    if (league.commissioner_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Delete in dependency order
    // 1. ledger_entries linked to transactions for this league
    const { data: leagueTxs } = await admin.from('transactions').select('id').eq('league_id', params.id);
    if (leagueTxs?.length) {
      await admin.from('ledger_entries').delete().in('transaction_id', leagueTxs.map(t => t.id));
    }

    // 2. transactions
    await admin.from('transactions').delete().eq('league_id', params.id);

    // 3. draft_picks
    await admin.from('draft_picks').delete().eq('league_id', params.id);

    // 4. league_members
    await admin.from('league_members').delete().eq('league_id', params.id);

    // 5. leagues (last)
    const { error } = await admin.from('leagues').delete().eq('id', params.id);
    if (error) {
      console.error('[DELETE league] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.log('[DELETE league] success');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete-league]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to delete league' }, { status: 500 });
  }
}
