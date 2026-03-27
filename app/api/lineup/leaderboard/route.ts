import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/lineup/leaderboard?league_id=X&week=Y
 *
 * Scores each member's weekly lineup submission by looking up
 * cached_stats for each picked unit and summing fantasy points.
 * Returns members ranked by total score descending.
 */
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
      // All weeks that have lineup entries for this league
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
      // Return members with 0 points
      const { data: members } = await admin
        .from('league_members')
        .select('user_id, team_name')
        .eq('league_id', league_id);

      return NextResponse.json({
        weeks: [],
        members: (members ?? []).map(m => ({ ...m, total: 0, weeklyScores: {} })),
      });
    }

    // Load all lineup picks for this league across relevant weeks
    const { data: allPicks } = await admin
      .from('draft_picks')
      .select('user_id, unit_id, week, player_data, salary_cost')
      .eq('league_id', league_id)
      .eq('entry_type', 'lineup')
      .in('week', weeks);

    // Load all cached_stats for the relevant schools + weeks
    // player_data.school + player_data.unitType → stat_type mapping
    const schoolWeekSet = new Set<string>();
    for (const pick of allPicks ?? []) {
      const school = pick.player_data?.school;
      const week   = pick.week;
      if (school && week) schoolWeekSet.add(`${school}::${week}`);
    }

    // Fetch cached stats rows
    const { data: statsRows } = await admin
      .from('cached_stats')
      .select('school, stat_type, week, fantasy_points')
      .in('week', weeks);

    // Build lookup: school + unitType + week → fantasy_points
    // stat_type in cached_stats corresponds to unitType
    const statsMap: Record<string, number> = {};
    for (const row of statsRows ?? []) {
      const key = `${row.school}::${row.stat_type}::${row.week}`;
      statsMap[key] = row.fantasy_points ?? 0;
    }

    // Score each pick
    type WeeklyScores = Record<number, number>;
    const memberScores: Record<string, WeeklyScores> = {};

    for (const pick of allPicks ?? []) {
      const school   = pick.player_data?.school;
      const unitType = pick.player_data?.unitType;
      const week     = pick.week;
      if (!school || !unitType || !week) continue;

      const pts = statsMap[`${school}::${unitType}::${week}`] ?? 0;
      if (!memberScores[pick.user_id]) memberScores[pick.user_id] = {};
      memberScores[pick.user_id][week] = (memberScores[pick.user_id][week] ?? 0) + pts;
    }

    // Load all members
    const { data: members } = await admin
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', league_id);

    const ranked = (members ?? []).map(m => {
      const weeklyScores = memberScores[m.user_id] ?? {};
      const total = Object.values(weeklyScores).reduce((s, p) => s + p, 0);
      return { user_id: m.user_id, team_name: m.team_name, total, weeklyScores };
    }).sort((a, b) => b.total - a.total);

    return NextResponse.json({
      weeks,
      members: ranked,
    }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err: any) {
    console.error('[lineup-leaderboard]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to load leaderboard' }, { status: 500 });
  }
}
