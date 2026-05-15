import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/[id]/dissolve
 *
 * Commissioner-only. Refunds all paid members 95% of their entry fee
 * (the 5% platform rake is non-refundable) then marks the league cancelled.
 *
 * Ledger: for each member
 *   credit  user_available  +refundCents
 *   debit   user_pending    -buyInCents
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const leagueId = params.id;
    const admin = createAdminClient();

    // 1. Verify caller is commissioner
    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, commissioner_id, status')
      .eq('id', leagueId)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.commissioner_id !== user.id) {
      return NextResponse.json({ error: 'Commissioner only' }, { status: 403 });
    }

    // 2. Verify paid league
    const buyInCents = Math.round((league.buy_in ?? 0) * 100);
    if (buyInCents === 0) {
      return NextResponse.json({ error: 'Only paid leagues can be dissolved for refunds' }, { status: 400 });
    }

    // 3. Get all members
    const { data: members } = await admin
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId);

    if (!members || members.length === 0) {
      await admin.from('leagues').update({ status: 'cancelled' }).eq('id', leagueId);
      return NextResponse.json({ refunded: 0, amountPerMember: 0 });
    }

    const refundCents = Math.floor(buyInCents * 0.95);
    let refunded = 0;

    // 4. Refund each member via ledger
    for (const member of members) {
      const { data: wallet } = await admin
        .from('wallets')
        .select('id')
        .eq('user_id', member.user_id)
        .single();
      if (!wallet) continue;

      const { data: accounts } = await admin
        .from('ledger_accounts')
        .select('id, type')
        .eq('wallet_id', wallet.id);

      const availableId = accounts?.find(a => a.type === 'user_available')?.id;
      const pendingId   = accounts?.find(a => a.type === 'user_pending')?.id;
      if (!availableId || !pendingId) continue;

      const { data: tx } = await admin
        .from('transactions')
        .insert({
          user_id:         member.user_id,
          type:            'refund',
          status:          'completed',
          amount_cents:    refundCents,
          league_id:       leagueId,
          idempotency_key: `dissolve_${leagueId}_${member.user_id}`,
          description:     `League dissolved refund: ${league.name}`,
        })
        .select('id')
        .single();
      if (!tx) continue;

      await admin.from('ledger_entries').insert([
        { transaction_id: tx.id, ledger_account_id: availableId, amount_cents: +refundCents },
        { transaction_id: tx.id, ledger_account_id: pendingId,   amount_cents: -buyInCents  },
      ]);

      refunded++;
    }

    // 5. Cancel the league
    await admin.from('leagues').update({ status: 'cancelled' }).eq('id', leagueId);

    return NextResponse.json({ refunded, amountPerMember: refundCents });
  } catch (err: any) {
    console.error('[dissolve]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to dissolve league' }, { status: 500 });
  }
}
