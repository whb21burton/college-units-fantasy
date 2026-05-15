import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/[id]/kick
 * Body: { memberId: string, refundEntry: boolean }
 *
 * Commissioner-only. Removes a member from the league.
 * Only refunds if they have a completed contest_entry transaction.
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

    // Verify commissioner
    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, commissioner_id')
      .eq('id', leagueId)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.commissioner_id !== user.id) {
      return NextResponse.json({ error: 'Commissioner only' }, { status: 403 });
    }
    if (memberId === user.id) {
      return NextResponse.json({ error: 'Cannot kick yourself' }, { status: 400 });
    }

    const buyInCents = Math.round((league.buy_in ?? 0) * 100);
    let refunded = false;
    let refundReason = 'no_payment_found';

    // Optionally refund — only if they have a completed contest_entry transaction
    if (refundEntry && buyInCents > 0) {
      const { data: entryTx } = await admin
        .from('transactions')
        .select('id')
        .eq('user_id', memberId)
        .eq('league_id', leagueId)
        .eq('type', 'contest_entry')
        .eq('status', 'completed')
        .limit(1)
        .single();

      if (entryTx) {
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

          const availableAcct = accounts?.find(a => a.type === 'user_available');
          const pendingAcct   = accounts?.find(a => a.type === 'user_pending');

          if (availableAcct) {
            const { data: refundTx } = await admin
              .from('transactions')
              .insert({
                user_id:         memberId,
                type:            'refund',
                status:          'completed',
                amount_cents:    buyInCents,
                league_id:       leagueId,
                idempotency_key: `kick_${leagueId}_${memberId}`,
                description:     `Kicked from league: ${league.name}`,
                completed_at:    new Date().toISOString(),
              })
              .select('id')
              .single();

            if (refundTx) {
              const entries: any[] = [
                { transaction_id: refundTx.id, ledger_account_id: availableAcct.id, amount_cents: +buyInCents },
              ];
              if (pendingAcct) {
                entries.push({ transaction_id: refundTx.id, ledger_account_id: pendingAcct.id, amount_cents: -buyInCents });
              }
              await admin.from('ledger_entries').insert(entries);

              await admin.from('transactions')
                .update({ status: 'reversed' })
                .eq('id', entryTx.id);

              refunded = true;
              refundReason = 'refunded';
            }
          }
        }
      } else {
        refundReason = 'no_payment_found';
      }
    } else if (!refundEntry) {
      refundReason = 'refund_declined';
    }

    // Remove from league
    await admin.from('league_members')
      .delete()
      .eq('league_id', leagueId)
      .eq('user_id', memberId);

    // Recalculate prize pool
    const { count: newCount } = await admin
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', leagueId);

    await admin.from('leagues')
      .update({ prize_pool_cents: (newCount ?? 0) * buyInCents })
      .eq('id', leagueId);

    return NextResponse.json({ kicked: true, refunded, reason: refundReason });
  } catch (err: any) {
    console.error('[kick]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to kick member' }, { status: 500 });
  }
}
