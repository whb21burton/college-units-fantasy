import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';
const BUDGET = 200;

// The 9 lineup slots bots need to fill
const BOT_SLOTS = [
  { key: 'QB',   unitType: 'QB'  },
  { key: 'RB1',  unitType: 'RB'  },
  { key: 'RB2',  unitType: 'RB'  },
  { key: 'WR1',  unitType: 'WR'  },
  { key: 'WR2',  unitType: 'WR'  },
  { key: 'TE',   unitType: 'TE'  },
  { key: 'FLEX', unitType: 'WR'  }, // random RB/WR/TE, keep simple
  { key: 'DEF',  unitType: 'DEF' },
  { key: 'K',    unitType: 'K'   },
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('users').select('email').eq('id', user.id).single();
    if (profile?.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { contestType, contestId, numBots = 5, simulateResults = true } = await req.json();
    if (!contestId) return NextResponse.json({ error: 'contestId required' }, { status: 400 });
    if (contestType !== 'weekly') return NextResponse.json({ error: 'Only weekly contests supported' }, { status: 400 });

    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, week, status, settings, league_type, conference_filter')
      .eq('id', contestId)
      .single();
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

    const buyInCents = Math.round((league.buy_in ?? 0) * 100);
    const week = league.week ?? 5;

    // ── Fetch player pool ──────────────────────────────────────────────────────
    const poolUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://collegeunitsfantasy.com'}/api/player-pool`;
    const poolRes = await fetch(poolUrl).catch(() => null);
    const poolData: any[] = poolRes?.ok ? await poolRes.json() : [];
    const pool: any[] = Array.isArray(poolData) ? poolData.filter(u => (u.price ?? 0) > 0) : [];

    if (pool.length < 20) return NextResponse.json({ error: 'Player pool too small to simulate' }, { status: 400 });

    // Group pool by unitType for easy random selection
    const byType: Record<string, any[]> = {};
    for (const u of pool) {
      if (!byType[u.unitType]) byType[u.unitType] = [];
      byType[u.unitType].push(u);
    }

    // ── Resolve / create bot accounts ─────────────────────────────────────────
    const authAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const botUsers: { id: string; email: string; teamName: string }[] = [];
    for (let i = 1; i <= numBots; i++) {
      const email = `bot${i}@sim.test`;
      const teamName = `Bot ${i}`;

      // Try to find existing bot in profiles
      const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      let botId: string;
      if (existing?.id) {
        botId = existing.id;
      } else {
        // Create auth user
        const { data: created, error: createErr } = await authAdmin.auth.admin.createUser({
          email,
          password: `BotPass${i}!sim`,
          email_confirm: true,
          user_metadata: { display_name: teamName },
        });
        if (createErr || !created?.user) {
          // Try to find in auth.users if already exists
          const { data: listData } = await authAdmin.auth.admin.listUsers();
          const found = (listData?.users ?? []).find((u: any) => u.email === email);
          if (!found) continue;
          botId = found.id;
        } else {
          botId = created.user.id;
        }
        // Ensure profile row
        await admin.from('profiles').upsert({ id: botId, email, display_name: teamName }, { onConflict: 'id' });
      }
      botUsers.push({ id: botId, email, teamName });
    }

    if (botUsers.length === 0) return NextResponse.json({ error: 'Failed to create/resolve bot accounts' }, { status: 500 });

    // ── For each bot: join league + submit lineup ──────────────────────────────
    const botsSubmitted: string[] = [];

    for (const bot of botUsers) {
      // Join league (ignore duplicate)
      await admin.from('league_members').upsert(
        { league_id: contestId, user_id: bot.id, team_name: bot.teamName },
        { onConflict: 'league_id,user_id' }
      );

      // Ensure wallet + ledger accounts exist
      let walletId: string | null = null;
      const { data: existingWallet } = await admin.from('wallets').select('id').eq('user_id', bot.id).maybeSingle();
      if (existingWallet) {
        walletId = existingWallet.id;
      } else {
        const { data: newWallet } = await admin.from('wallets').insert({ user_id: bot.id }).select('id').single();
        if (newWallet) {
          walletId = newWallet.id;
          await admin.from('ledger_accounts').insert([
            { wallet_id: walletId, type: 'user_available' },
            { wallet_id: walletId, type: 'user_pending' },
          ]);
        }
      }

      // If buy-in, credit wallet and charge entry
      if (buyInCents > 0 && walletId) {
        const { data: accts } = await admin.from('ledger_accounts').select('id, type').eq('wallet_id', walletId);
        const availAcct = accts?.find(a => a.type === 'user_available');
        if (availAcct) {
          // Credit enough for entry
          const { data: creditTx } = await admin.from('transactions').insert({
            user_id: bot.id, type: 'deposit', status: 'completed',
            amount_cents: buyInCents,
            idempotency_key: `sim_credit_${contestId}_${bot.id}`,
            description: 'Simulation credit',
            completed_at: new Date().toISOString(),
          }).select('id').single();
          if (creditTx) {
            await admin.from('ledger_entries').insert([
              { transaction_id: creditTx.id, ledger_account_id: availAcct.id, amount_cents: buyInCents },
            ]);
          }
          // Charge entry
          const { data: entryTx } = await admin.from('transactions').insert({
            user_id: bot.id, type: 'contest_entry', status: 'completed',
            amount_cents: buyInCents, league_id: contestId,
            idempotency_key: `sim_entry_${contestId}_${bot.id}`,
            description: `Entry: ${league.name}`,
            completed_at: new Date().toISOString(),
          }).select('id').single();
          if (entryTx) {
            await admin.from('ledger_entries').insert([
              { transaction_id: entryTx.id, ledger_account_id: availAcct.id, amount_cents: -buyInCents },
            ]);
          }
        }
      }

      // Build random valid lineup under $200
      const picks: any[] = [];
      const usedIds = new Set<string>();
      let salary = 0;

      for (const slot of BOT_SLOTS) {
        const candidates = (byType[slot.unitType] ?? []).filter(u => !usedIds.has(u.id) && salary + (u.price ?? 0) <= BUDGET);
        if (candidates.length === 0) continue;
        const chosen = rand(candidates);
        usedIds.add(chosen.id);
        salary += chosen.price ?? 0;
        picks.push({
          unit_id:     chosen.id,
          slot:        slot.unitType,
          slot_key:    slot.key,
          salary_cost: chosen.price ?? 0,
          player_data: { ...chosen, _slot: slot.key, _salary: chosen.price ?? 0 },
        });
      }

      if (picks.length < 9) continue; // couldn't fill lineup, skip

      // Delete any existing picks for this bot in this contest/week
      await admin.from('draft_picks')
        .delete()
        .eq('league_id', contestId)
        .eq('user_id', bot.id)
        .eq('week', week)
        .eq('entry_type', 'lineup')
        .eq('entry_number', 1);

      const rows = picks.map((p, i) => ({
        league_id:    contestId,
        user_id:      bot.id,
        player_id:    p.unit_id,
        player_data:  p.player_data,
        round:        0,
        pick_number:  Math.floor(Math.random() * 1_000_000_000) + i,
        week,
        entry_type:   'lineup',
        entry_number: 1,
      }));
      await admin.from('draft_picks').insert(rows);
      botsSubmitted.push(bot.teamName);
    }

    // ── Score + payout if simulateResults ─────────────────────────────────────
    let rankings: any[] = [];
    let payoutCount = 0;

    if (simulateResults && botsSubmitted.length > 0) {
      const { data: allPicks } = await admin
        .from('draft_picks')
        .select('user_id, week, player_data, entry_number')
        .eq('league_id', contestId)
        .eq('entry_type', 'lineup')
        .eq('week', week);

      const schoolSet = new Set<string>();
      for (const p of allPicks ?? []) if (p.player_data?.school) schoolSet.add(p.player_data.school);

      const { data: statsRows } = await admin
        .from('cached_stats')
        .select('school, stat_type, week, value')
        .eq('week', week)
        .in('school', Array.from(schoolSet))
        .in('stat_type', ['unit_QB_fpts','unit_RB_fpts','unit_WR_fpts','unit_TE_fpts','unit_DEF_fpts','unit_K_fpts'])
        .is('player_name', null);

      const statsMap: Record<string, number> = {};
      for (const row of statsRows ?? []) {
        const unitType = row.stat_type.replace('unit_', '').replace('_fpts', '');
        statsMap[`${row.school}::${unitType}`] = row.value ?? 0;
      }

      const entryMap: Record<string, { user_id: string; entry_number: number; total: number }> = {};
      for (const pick of allPicks ?? []) {
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
      const netPool = Math.round(buyInCents * totalEntries * 0.95);
      const payoutStructure = league.settings?.payout_structure ?? 'winner_take_all';
      const payouts: Record<string, number> = {};

      if (payoutStructure === 'winner_take_all' && ranked[0]) {
        payouts[`${ranked[0].user_id}::${ranked[0].entry_number}`] = netPool;
      } else if (payoutStructure === 'top2' && ranked.length >= 2) {
        payouts[`${ranked[0].user_id}::${ranked[0].entry_number}`] = Math.round(netPool * 0.70);
        payouts[`${ranked[1].user_id}::${ranked[1].entry_number}`] = Math.round(netPool * 0.30);
      } else if (payoutStructure === 'top3' && ranked.length >= 3) {
        payouts[`${ranked[0].user_id}::${ranked[0].entry_number}`] = Math.round(netPool * 0.60);
        payouts[`${ranked[1].user_id}::${ranked[1].entry_number}`] = Math.round(netPool * 0.25);
        payouts[`${ranked[2].user_id}::${ranked[2].entry_number}`] = Math.round(netPool * 0.15);
      } else if (payoutStructure === 'double_up') {
        const numWinners = Math.floor(totalEntries / 2);
        for (let i = 0; i < numWinners && i < ranked.length; i++) {
          payouts[`${ranked[i].user_id}::${ranked[i].entry_number}`] = Math.round(buyInCents * 1.95);
        }
      } else if (ranked[0]) {
        payouts[`${ranked[0].user_id}::${ranked[0].entry_number}`] = netPool;
      }

      for (const [key, amountCents] of Object.entries(payouts)) {
        if (amountCents <= 0) continue;
        const [uid] = key.split('::');
        const { data: wallet } = await admin.from('wallets').select('id').eq('user_id', uid).single();
        if (!wallet) continue;
        const { data: accts } = await admin.from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id);
        const availAcct = accts?.find(a => a.type === 'user_available');
        if (!availAcct) continue;
        const { data: payTx } = await admin.from('transactions').insert({
          user_id: uid, type: 'contest_payout', status: 'completed',
          amount_cents: amountCents, league_id: contestId,
          idempotency_key: `sim_payout_${contestId}_${key}`,
          description: `Sim payout: ${league.name}`,
          completed_at: new Date().toISOString(),
        }).select('id').single();
        if (payTx) {
          await admin.from('ledger_entries').insert([{ transaction_id: payTx.id, ledger_account_id: availAcct.id, amount_cents: amountCents }]);
          payoutCount++;
        }
      }

      // Load team names for rankings
      const { data: members } = await admin.from('league_members').select('user_id, team_name').eq('league_id', contestId);
      const memberMap: Record<string, string> = {};
      for (const m of members ?? []) memberMap[m.user_id] = m.team_name;

      rankings = ranked.slice(0, 10).map((e, i) => ({
        rank: i + 1,
        team_name: memberMap[e.user_id] ?? e.user_id.slice(0, 8),
        total: Math.round(e.total * 100) / 100,
        payout: payouts[`${e.user_id}::${e.entry_number}`] ?? 0,
      }));

      await admin.from('leagues').update({ status: 'completed' }).eq('id', contestId);
    }

    return NextResponse.json({
      success: true,
      botsCreated: botUsers.length,
      botsSubmitted: botsSubmitted.length,
      simulateResults,
      payoutCount,
      scores: rankings,
      winner: rankings[0]?.team_name ?? null,
    });
  } catch (err: any) {
    console.error('[simulate]', err);
    return NextResponse.json({ error: err?.message ?? 'Simulation failed' }, { status: 500 });
  }
}
