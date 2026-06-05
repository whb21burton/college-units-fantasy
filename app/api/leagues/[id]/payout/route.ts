import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from('users').select('email').eq('id', user.id).single();
    if (profile?.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, week, status, settings, league_type')
      .eq('id', params.id)
      .single();
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.league_type !== 'weekly') {
      return NextResponse.json({ error: 'Payout only supported for weekly leagues' }, { status: 400 });
    }

    // Load all picks for contest week
    const { data: allPicks } = await admin
      .from('draft_picks')
      .select('user_id, week, player_data, entry_number')
      .eq('league_id', params.id)
      .eq('entry_type', 'lineup')
      .eq('week', league.week);

    if (!allPicks?.length) {
      return NextResponse.json({ error: 'No picks found for this league/week' }, { status: 400 });
    }

    // Collect unique schools
    const schoolSet = new Set<string>();
    for (const p of allPicks) {
      if (p.player_data?.school) schoolSet.add(p.player_data.school);
    }

    // Fetch stored fpts values
    const { data: statsRows } = await admin
      .from('cached_stats')
      .select('school, stat_type, week, value')
      .eq('week', league.week)
      .in('school', Array.from(schoolSet))
      .in('stat_type', ['unit_QB_fpts','unit_RB_fpts','unit_WR_fpts','unit_TE_fpts','unit_DEF_fpts','unit_K_fpts'])
      .is('player_name', null);

    const statsMap: Record<string, number> = {};
    for (const row of statsRows ?? []) {
      const unitType = row.stat_type.replace('unit_', '').replace('_fpts', '');
      statsMap[`${row.school}::${unitType}`] = row.value ?? 0;
    }

    // Score each entry
    type EntryScore = { user_id: string; entry_number: number; total: number };
    const entryMap: Record<string, EntryScore> = {};
    for (const pick of allPicks) {
      const school = pick.player_data?.school;
      const unitType = pick.player_data?.unitType;
      const entryNum = pick.entry_number ?? 1;
      if (!school || !unitType) continue;
      const key = `${pick.user_id}::${entryNum}`;
      if (!entryMap[key]) entryMap[key] = { user_id: pick.user_id, entry_number: entryNum, total: 0 };
      entryMap[key].total += statsMap[`${school}::${unitType}`] ?? 0;
    }

    const ranked = Object.values(entryMap).sort((a, b) => b.total - a.total);
    const totalEntries = ranked.length;
    const buyInCents = Math.round((league.buy_in ?? 0) * 100);
    const totalPool = buyInCents * totalEntries;
    const netPool = Math.round(totalPool * 0.95); // 5% rake

    // Build payout map
    const payoutStructure = league.settings?.payout_structure ?? 'winner_take_all';
    const payouts: Record<string, number> = {}; // user_id::entry_number → cents

    if (payoutStructure === 'winner_take_all') {
      if (ranked[0]) payouts[`${ranked[0].user_id}::${ranked[0].entry_number}`] = netPool;
    } else if (payoutStructure === 'top2' && ranked.length >= 2) {
      payouts[`${ranked[0].user_id}::${ranked[0].entry_number}`] = Math.round(netPool * 0.70);
      payouts[`${ranked[1].user_id}::${ranked[1].entry_number}`] = Math.round(netPool * 0.30);
    } else if (payoutStructure === 'top3' && ranked.length >= 3) {
      payouts[`${ranked[0].user_id}::${ranked[0].entry_number}`] = Math.round(netPool * 0.60);
      payouts[`${ranked[1].user_id}::${ranked[1].entry_number}`] = Math.round(netPool * 0.25);
      payouts[`${ranked[2].user_id}::${ranked[2].entry_number}`] = Math.round(netPool * 0.15);
    } else if (payoutStructure === 'double_up') {
      const numWinners = Math.floor(totalEntries / 2);
      const perWinner = Math.round(buyInCents * 1.95);
      for (let i = 0; i < numWinners && i < ranked.length; i++) {
        payouts[`${ranked[i].user_id}::${ranked[i].entry_number}`] = perWinner;
      }
    } else {
      // fallback: winner take all
      if (ranked[0]) payouts[`${ranked[0].user_id}::${ranked[0].entry_number}`] = netPool;
    }

    // Credit winners
    let payoutCount = 0;
    for (const [key, amountCents] of Object.entries(payouts)) {
      if (amountCents <= 0) continue;
      const [userId] = key.split('::');

      const { data: wallet } = await admin
        .from('wallets').select('id').eq('user_id', userId).single();
      if (!wallet) continue;

      const { data: accounts } = await admin
        .from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id);
      const availableAcct = accounts?.find(a => a.type === 'user_available');
      if (!availableAcct) continue;

      const { data: payoutTx } = await admin
        .from('transactions')
        .insert({
          user_id:         userId,
          type:            'contest_payout',
          status:          'completed',
          amount_cents:    amountCents,
          league_id:       params.id,
          idempotency_key: `payout_${params.id}_${key}`,
          description:     `Payout: ${league.name} week ${league.week}`,
          completed_at:    new Date().toISOString(),
        })
        .select('id')
        .single();
      if (!payoutTx) continue;

      await admin.from('ledger_entries').insert([
        { transaction_id: payoutTx.id, ledger_account_id: availableAcct.id, amount_cents: amountCents },
      ]);
      payoutCount++;
    }

    // Mark league completed
    await admin.from('leagues').update({ status: 'completed' }).eq('id', params.id);

    return NextResponse.json({
      success: true,
      totalEntries,
      netPool,
      payouts: Object.entries(payouts).map(([k, v]) => ({ key: k, cents: v })),
      payoutCount,
      rankings: ranked.slice(0, 10).map((e, i) => ({ rank: i + 1, ...e })),
    });
  } catch (err: any) {
    console.error('[league-payout]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
