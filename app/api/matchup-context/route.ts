/**
 * GET /api/matchup-context?week=N&season=YYYY
 *
 * Returns for each school:
 *   - opponentMap: school → opponent school this week
 *   - rankMap:     school → Elo power rank (1 = best, updated weekly after each game)
 *
 * The rankMap is used to compute the Opponent Rank (OR) multiplier for
 * RB/WR/TE/DEF units: finalProjection = weeklyBase × orMultiplier.
 */
import { NextResponse } from 'next/server';
import { initCfbdClient } from '@/lib/cfbd-client';

const pkg = require('cfbd');
const { getGames, getElo } = pkg;

const SEASON = 2025;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const week   = parseInt(searchParams.get('week')   || '1', 10);
  const season = parseInt(searchParams.get('season') || String(SEASON), 10);

  try {
    initCfbdClient();

    // Fetch games and Elo ratings in parallel
    const [gamesRes, eloData] = await Promise.all([
      getGames({ query: { year: season, week } }).then((r: any) => r.data || []),
      getElo({ query: { year: season, week } }).then((r: any) => r.data || []).catch(() => []),
    ]);

    // Build rank map: sort by Elo descending, rank 1 = strongest team
    const eloSorted: any[] = [...(eloData as any[])].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    const rankMap: Record<string, number> = {};
    eloSorted.forEach((t, idx) => { rankMap[t.team] = idx + 1; });

    // Build opponent map from this week's schedule
    const opponentMap: Record<string, string> = {};
    for (const g of gamesRes as any[]) {
      opponentMap[g.homeTeam] = g.awayTeam;
      opponentMap[g.awayTeam] = g.homeTeam;
    }

    return NextResponse.json(
      { week, season, opponentMap, rankMap },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    );
  } catch (err: any) {
    console.error('matchup-context error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
