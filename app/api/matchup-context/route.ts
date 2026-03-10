/**
 * GET /api/matchup-context?week=N&season=YYYY
 *
 * Returns for each school:
 *   - opponentMap:  school → opponent school this week
 *   - rankMap:      school → Elo power rank (1 = best)
 *   - defRankMap:   school → SP+ defensive rank (1 = best defense = toughest to score on)
 *   - offRankMap:   school → SP+ offensive rank (1 = best offense)
 *
 * ODR multiplier (applied to RB/WR/TE/QB/K): based on opponent's defRankMap value
 * OOR multiplier (applied to DEF):            based on opponent's offRankMap value
 */
import { NextResponse } from 'next/server';
import { initCfbdClient } from '@/lib/cfbd-client';

const pkg = require('cfbd');
const { getGames, getElo, getSp } = pkg;

const SEASON = 2025;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const week   = parseInt(searchParams.get('week')   || '1', 10);
  const season = parseInt(searchParams.get('season') || String(SEASON), 10);

  try {
    initCfbdClient();

    const [gamesRes, eloData, spRes] = await Promise.all([
      // seasonType: 'regular' avoids bowl/postseason games bleeding into schedule
      getGames({ query: { year: season, week, seasonType: 'regular' } }).then((r: any) => r.data || []),
      getElo({ query: { year: season, week } }).then((r: any) => r.data || []).catch(() => []),
      getSp({ query: { year: season } }).then((r: any) => r.data || []).catch(() => []),
    ]);

    // ── Elo rank map (general team strength, used for display) ──
    const eloSorted: any[] = [...(eloData as any[])].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    const rankMap: Record<string, number> = {};
    eloSorted.forEach((t, idx) => { rankMap[t.team] = idx + 1; });

    // ── SP+ rank maps (1 = best offense/defense) ──────────────
    // Strategy:
    //   1. Try pre-computed .rank fields from SP+ response
    //   2. If empty, derive ranks by sorting on .rating values
    //      (higher SP+ rating = better unit = rank 1)
    //   3. If SP+ has no data at all, fall back to Elo rankMap
    const spList: any[] = spRes as any[];
    const defRankMap: Record<string, number> = {};
    const offRankMap: Record<string, number> = {};

    // Try pre-computed rank fields first
    for (const t of spList) {
      if (!t.team) continue;
      if (t.defense?.rank  != null) defRankMap[t.team] = t.defense.rank;
      if (t.offense?.rank  != null) offRankMap[t.team] = t.offense.rank;
    }

    // Fall back: derive from rating values if ranks weren't populated
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

    // Final fallback: use Elo rank for both if SP+ returned nothing
    if (Object.keys(defRankMap).length === 0) {
      Object.assign(defRankMap, rankMap);
    }
    if (Object.keys(offRankMap).length === 0) {
      Object.assign(offRankMap, rankMap);
    }

    // ── Opponent map from this week's regular-season schedule ──
    const opponentMap: Record<string, string> = {};
    for (const g of gamesRes as any[]) {
      if (g.homeTeam && g.awayTeam) {
        opponentMap[g.homeTeam] = g.awayTeam;
        opponentMap[g.awayTeam] = g.homeTeam;
      }
    }

    return NextResponse.json(
      { week, season, opponentMap, rankMap, defRankMap, offRankMap },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    );
  } catch (err: any) {
    console.error('matchup-context error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
