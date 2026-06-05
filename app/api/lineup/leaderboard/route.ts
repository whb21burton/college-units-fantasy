import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const league_id = searchParams.get('league_id');
    const weekParam = searchParams.get('week');

    if (!league_id) {
      return NextResponse.json({ error: 'league_id is required' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Determine which weeks to score
    let weeks: number[];
    if (weekParam) {
      weeks = [parseInt(weekParam, 10)];
    } else {
      const { data: weekRows } = await admin
        .from('draft_picks')
        .select('week')
        .eq('league_id', league_id)
        .eq('entry_type', 'lineup')
        .not('week', 'is', null);
      const weekSet = new Set<number>((weekRows ?? []).map((r: any) => r.week));
      weeks = Array.from(weekSet).sort((a, b) => a - b);
    }

    if (weeks.length === 0) {
      const { data: members } = await admin
        .from('league_members')
        .select('user_id, team_name')
        .eq('league_id', league_id);
      return NextResponse.json({
        weeks: [],
        members: (members ?? []).map(m => ({ ...m, total: 0, weeklyScores: {}, entries: [] })),
      });
    }

    // Load all lineup picks for this league
    const { data: allPicks } = await admin
      .from('draft_picks')
      .select('user_id, week, player_data, entry_number')
      .eq('league_id', league_id)
      .eq('entry_type', 'lineup')
      .in('week', weeks);

    // Get all unique schools + weeks to fetch stats for
    const schoolSet = new Set<string>();
    for (const pick of allPicks ?? []) {
      if (pick.player_data?.school && pick.week) {
        schoolSet.add(pick.player_data.school);
      }
    }

    // Fetch unit_*_fpts stats — these are the exact FPTS values
    const { data: statsRows } = await admin
      .from('cached_stats')
      .select('school, stat_type, week, value')
      .in('week', weeks)
      .in('school', Array.from(schoolSet))
      .in('stat_type', [
        'unit_QB_fpts','unit_RB_fpts','unit_WR_fpts',
        'unit_TE_fpts','unit_DEF_fpts','unit_K_fpts'
      ])
      .is('player_name', null);

    // Build lookup: school::unitType::week → fpts
    const statsMap: Record<string, number> = {};
    for (const row of statsRows ?? []) {
      const unitType = row.stat_type.replace('unit_', '').replace('_fpts', '');
      const key = `${row.school}::${unitType}::${row.week}`;
      statsMap[key] = row.value ?? 0;
    }

    // Score each pick — group by user_id + entry_number
    type EntryKey = string; // userId::entryNumber
    const entryScores: Record<EntryKey, Record<number, number>> = {};
    const entryMeta: Record<EntryKey, { user_id: string; entry_number: number }> = {};

    for (const pick of allPicks ?? []) {
      const school    = pick.player_data?.school;
      const unitType  = pick.player_data?.unitType;
      const week      = pick.week;
      const entryNum  = pick.entry_number ?? 1;
      if (!school || !unitType || !week) continue;

      const entryKey = `${pick.user_id}::${entryNum}`;
      const pts = statsMap[`${school}::${unitType}::${week}`] ?? 0;

      if (!entryScores[entryKey]) {
        entryScores[entryKey] = {};
        entryMeta[entryKey] = { user_id: pick.user_id, entry_number: entryNum };
      }
      entryScores[entryKey][week] = (entryScores[entryKey][week] ?? 0) + pts;
    }

    // Load members for team names
    const { data: members } = await admin
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', league_id);

    const memberMap: Record<string, string> = {};
    for (const m of members ?? []) memberMap[m.user_id] = m.team_name;

    // Build ranked entries — each entry is a separate row
    const entries = Object.entries(entryScores).map(([entryKey, weeklyScores]) => {
      const meta  = entryMeta[entryKey];
      const total = Object.values(weeklyScores).reduce((s, p) => s + p, 0);
      const teamName = memberMap[meta.user_id] ?? 'Unknown';
      const entryLabel = meta.entry_number > 1
        ? `${teamName} (${meta.entry_number})`
        : teamName;
      return {
        user_id:      meta.user_id,
        entry_number: meta.entry_number,
        team_name:    entryLabel,
        total:        Math.round(total * 100) / 100,
        weeklyScores,
      };
    }).sort((a, b) => b.total - a.total);

    // Also keep member-level rollup for backwards compat
    const memberRollup = (members ?? []).map(m => {
      const myEntries = entries.filter(e => e.user_id === m.user_id);
      const weeklyScores: Record<number, number> = {};
      for (const e of myEntries) {
        for (const [w, pts] of Object.entries(e.weeklyScores)) {
          weeklyScores[parseInt(w)] = (weeklyScores[parseInt(w)] ?? 0) + pts;
        }
      }
      const total = Object.values(weeklyScores).reduce((s, p) => s + p, 0);
      return { user_id: m.user_id, team_name: m.team_name, total: Math.round(total * 100) / 100, weeklyScores, entries: myEntries };
    }).sort((a, b) => b.total - a.total);

    return NextResponse.json({
      weeks,
      members: memberRollup,
      entries,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('[lineup-leaderboard]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
