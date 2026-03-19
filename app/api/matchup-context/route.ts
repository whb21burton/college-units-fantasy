/**
 * GET /api/matchup-context?week=N&season=YYYY
 *
 * Returns for each school:
 *   - opponentMap:  school → opponent school this week  (from cached_schedule)
 *   - rankMap:      school → Elo power rank (1 = best)
 *   - defRankMap:   school → SP+ defensive rank (1 = best defense = toughest to score on)
 *   - offRankMap:   school → SP+ offensive rank (1 = best offense)
 *
 * opponentMap is read from cached_schedule (Supabase) so it always matches
 * the same schedule used by game-stats and cached_stats.  Elo/SP+ still come
 * from the CFBD API because we don't cache ratings in Supabase yet.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { initCfbdClient } from '@/lib/cfbd-client';

const pkg = require('cfbd');
const { getElo, getSp } = pkg;

const SEASON = 2025;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const week   = parseInt(searchParams.get('week')   || '1', 10);
  const season = parseInt(searchParams.get('season') || String(SEASON), 10);

  try {
    initCfbdClient();
    const admin = createAdminClient();

    // Fetch schedule from Supabase + Elo/SP+ from CFBD in parallel
    const [scheduleRes, eloData, spRes] = await Promise.all([
      admin
        .from('cached_schedule')
        .select('home_team, away_team')
        .eq('week', week)
        .eq('season', season),
      getElo({ query: { year: season, week } }).then((r: any) => r.data || []).catch(() => []),
      getSp({ query: { year: season } }).then((r: any) => r.data || []).catch(() => []),
    ]);

    // ── Elo rank map (general team strength, used for display) ──
    const eloSorted: any[] = [...(eloData as any[])].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    const rankMap: Record<string, number> = {};
    eloSorted.forEach((t, idx) => { rankMap[t.team] = idx + 1; });

    // ── SP+ rank maps (1 = best offense/defense) ──────────────
    const spList: any[] = spRes as any[];
    const defRankMap: Record<string, number> = {};
    const offRankMap: Record<string, number> = {};

    for (const t of spList) {
      if (!t.team) continue;
      if (t.defense?.rank != null) defRankMap[t.team] = t.defense.rank;
      if (t.offense?.rank != null) offRankMap[t.team] = t.offense.rank;
    }

    if (Object.keys(defRankMap).length === 0) {
      [...spList]
        .filter(t => t.team && t.defense?.rating != null)
        .sort((a, b) => (b.defense.rating ?? 0) - (a.defense.rating ?? 0))
        .forEach((t, i) => { defRankMap[t.team] = i + 1; });
    }
    if (Object.keys(offRankMap).length === 0) {
      [...spList]
        .filter(t => t.team && t.offense?.rating != null)
        .sort((a, b) => (b.offense.rating ?? 0) - (a.offense.rating ?? 0))
        .forEach((t, i) => { offRankMap[t.team] = i + 1; });
    }

    if (Object.keys(defRankMap).length === 0) Object.assign(defRankMap, rankMap);
    if (Object.keys(offRankMap).length === 0) Object.assign(offRankMap, rankMap);

    // ── Opponent map from cached_schedule (same source as game-stats) ──
    const opponentMap: Record<string, string> = {};
    for (const g of scheduleRes.data ?? []) {
      if (g.home_team && g.away_team) {
        opponentMap[g.home_team] = g.away_team;
        opponentMap[g.away_team] = g.home_team;
      }
    }

    return NextResponse.json(
      { week, season, opponentMap, rankMap, defRankMap, offRankMap },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('matchup-context error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
