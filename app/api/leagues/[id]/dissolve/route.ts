import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();

    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, league_type, commissioner_id, status')
      .eq('id', params.id)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.commissioner_id !== user.id) return NextResponse.json({ error: 'Not commissioner' }, { status: 403 });
    if (league.league_type === 'weekly') {
      return NextResponse.json({ error: 'Weekly leagues cannot be dissolved with refunds' }, { status: 400 });
    }

    if (league.buy_in === 0) {
      await admin.from('leagues').update({ status: 'cancelled' }).eq('id', params.id);
      return NextResponse.json({ refunded: 0, amountPerMember: 0 });
    }

    const buyCents = Math.round(league.buy_in * 100);

    // Only refund members who actually paid
    const { data: paidTransactions } = await admin
      .from('transactions')
      .select('id, user_id, amount_cents')
      .eq('league_id', params.id)
      .eq('type', 'contest_entry')
      .eq('status', 'completed');

    const paidMembers = paidTransactions ?? [];
    let refundCount = 0;

    for (const tx of paidMembers) {
      const { data: wallet } = await admin
        .from('wallets')
        .select('id')
        .eq('user_id', tx.user_id)
        .single();
      if (!wallet) continue;

      const { data: accounts } = await admin
        .from('ledger_accounts')
        .select('id, type')
        .eq('wallet_id', wallet.id);

      const availableAcct = accounts?.find(a => a.type === 'user_available');
      const pendingAcct   = accounts?.find(a => a.type === 'user_pending');
      if (!availableAcct) continue;

      const { data: refundTx } = await admin
        .from('transactions')
        .insert({
          user_id:         tx.user_id,
          type:            'refund',
          status:          'completed',
          amount_cents:    buyCents,
          league_id:       params.id,
          idempotency_key: `dissolve_refund_${params.id}_${tx.user_id}`,
          description:     `Refund: ${league.name} dissolved`,
          completed_at:    new Date().toISOString(),
        })
        .select('id')
        .single();
      if (!refundTx) continue;

      const entries: any[] = [
        { transaction_id: refundTx.id, ledger_account_id: availableAcct.id, amount_cents: +buyCents },
      ];
      if (pendingAcct) {
        entries.push({ transaction_id: refundTx.id, ledger_account_id: pendingAcct.id, amount_cents: -buyCents });
      }
      await admin.from('ledger_entries').insert(entries);

      await admin.from('transactions')
        .update({ status: 'reversed' })
        .eq('id', tx.id);

      refundCount++;
    }

    await admin.from('leagues').update({ status: 'cancelled' }).eq('id', params.id);

    return NextResponse.json({ refunded: refundCount, amountPerMember: buyCents });
  } catch (err: any) {
    console.error('[dissolve]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to dissolve league' }, { status: 500 });
  }
}
