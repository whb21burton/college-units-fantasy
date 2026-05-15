import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/[id]/kick
 * Body: { memberId: string, refundEntry: boolean }
 *
 * Commissioner-only. Removes one member from the league.
 * If refundEntry === true, returns full buy-in to their wallet (no rake deduction on kicks).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const leagueId = params.id;
    const body = await req.json();
    const { memberId, refundEntry } = body as { memberId?: string; refundEntry?: boolean };
    if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

    const admin = createAdminClient();

    // 1. Verify commissioner
    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, commissioner_id')
      .eq('id', leagueId)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.commissioner_id !== user.id) {
      return NextResponse.json({ error: 'Commissioner only' }, { status: 403 });
    }

    // 2. Cannot kick yourself
    if (memberId === user.id) {
      return NextResponse.json({ error: 'Cannot kick yourself' }, { status: 400 });
    }

    const buyInCents = Math.round((league.buy_in ?? 0) * 100);

    // 3. Remove from league
    await admin.from('league_members')
      .delete()
      .eq('league_id', leagueId)
      .eq('user_id', memberId);

    // 4. Optional full refund (no rake — commissioner chose to return full entry)
    if (refundEntry && buyInCents > 0) {
      const { data: wallet } = await admin
        .from('wallets')
        .select('id')
        .eq('user_id', memberId)
        .single();

      if (wallet) {
        const { data: accounts } = await admin
          .from('ledger_accounts')
          .select('id, type')
          .eq('wallet_id', wallet.id);

        const availableId = accounts?.find(a => a.type === 'user_available')?.id;
        const pendingId   = accounts?.find(a => a.type === 'user_pending')?.id;

        if (availableId && pendingId) {
          const { data: tx } = await admin
            .from('transactions')
            .insert({
              user_id:         memberId,
              type:            'refund',
              status:          'completed',
              amount_cents:    buyInCents,
              league_id:       leagueId,
              idempotency_key: `kick_${leagueId}_${memberId}`,
              description:     `Kicked from league: ${league.name}`,
            })
            .select('id')
            .single();

          if (tx) {
            await admin.from('ledger_entries').insert([
              { transaction_id: tx.id, ledger_account_id: availableId, amount_cents: +buyInCents },
              { transaction_id: tx.id, ledger_account_id: pendingId,   amount_cents: -buyInCents },
            ]);
          }
        }
      }
    }

    // 5. Recalculate prize pool
    const { count: newCount } = await admin
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', leagueId);

    await admin.from('leagues')
      .update({ prize_pool_cents: (newCount ?? 0) * buyInCents })
      .eq('id', leagueId);

    return NextResponse.json({ kicked: true, refunded: !!refundEntry });
  } catch (err: any) {
    console.error('[kick]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to kick member' }, { status: 500 });
  }
}
