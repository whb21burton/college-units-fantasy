/**
 * GET /api/matchup-context?week=N&season=YYYY
 *
 * Returns for each P4 school:
 *   - opponentMap: school → opponent school this week
 *   - offPct:      school → offensive strength percentile (0–100, higher = better offense)
 *   - defPct:      school → defensive strength percentile (0–100, higher = better defense)
 *
 * Projections for offensive units should be multiplied by offMatchupMult(defPct[opponent]).
 * Projections for DEF units should be multiplied by defMatchupMult(offPct[opponent]).
 */
import { NextResponse } from 'next/server';
import { initCfbdClient } from '@/lib/cfbd-client';

const pkg = require('cfbd');
const { getGames, getTeamStats } = pkg;

const SEASON = 2025;
const P4_CONFS = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents'];

function percentileRank(sorted: number[], target: number): number {
  // sorted ascending
  const below = sorted.filter(v => v < target).length;
  return sorted.length <= 1 ? 50 : Math.round((below / (sorted.length - 1)) * 100);
}

/** Multiplier for offensive units based on opponent's defensive strength. */
function offMatchupMult(opponentDefPct: number): number {
  if (opponentDefPct >= 85) return 0.70;
  if (opponentDefPct >= 70) return 0.83;
  if (opponentDefPct >= 55) return 0.93;
  if (opponentDefPct >= 40) return 1.00;
  if (opponentDefPct >= 25) return 1.10;
  if (opponentDefPct >= 10) return 1.20;
  return 1.30;
}

/** Multiplier for DEF units based on opponent's offensive strength. */
function defMatchupMult(opponentOffPct: number): number {
  if (opponentOffPct >= 85) return 0.70;
  if (opponentOffPct >= 70) return 0.83;
  if (opponentOffPct >= 55) return 0.93;
  if (opponentOffPct >= 40) return 1.00;
  if (opponentOffPct >= 25) return 1.10;
  if (opponentOffPct >= 10) return 1.20;
  return 1.30;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const week   = parseInt(searchParams.get('week')   || '1', 10);
  const season = parseInt(searchParams.get('season') || String(SEASON), 10);

  try {
    initCfbdClient();

    // Fetch team stats for all P4 conferences (use SEASON for strength, not necessarily the query season)
    const teamStatArrays = await Promise.all(
      P4_CONFS.map(conf =>
        getTeamStats({ query: { year: SEASON, conference: conf } }).then((r: any) => r.data || [])
      )
    );
    const allTeamRows: any[] = teamStatArrays.flat();

    // team → statName → value
    const ts: Record<string, Record<string, number>> = {};
    for (const row of allTeamRows) {
      if (!ts[row.team]) ts[row.team] = {};
      ts[row.team][row.statName] = parseFloat(row.statValue) || 0;
    }
    const p4Teams = Object.keys(ts);

    // Raw offensive score per team: total yards + scoring rate
    const rawOff: Record<string, number> = {};
    const rawDef: Record<string, number> = {};
    for (const team of p4Teams) {
      const s = ts[team];
      const games = s.games || 12;
      rawOff[team] =
        (s.netPassingYards || 0) / games * 0.04 +
        (s.rushingYards    || 0) / games * 0.10 +
        ((s.passingTDs || 0) + (s.rushingTDs || 0)) / games * 4;

      rawDef[team] =
        (s.sacks             || 0) / games * 2 +
        (s.tacklesForLoss    || 0) / games * 1 +
        (s.passesIntercepted || 0) / games * 3 +
        (s.fumblesRecovered  || 0) / games * 2 -
        ((s.netPassingYardsOpponent || 0) + (s.rushingYardsOpponent || 0)) / games * 0.003;
    }

    const offScoresSorted = [...Object.values(rawOff)].sort((a, b) => a - b);
    const defScoresSorted = [...Object.values(rawDef)].sort((a, b) => a - b);

    const offPct: Record<string, number> = {};
    const defPct: Record<string, number> = {};
    for (const team of p4Teams) {
      offPct[team] = percentileRank(offScoresSorted, rawOff[team]);
      defPct[team] = percentileRank(defScoresSorted, rawDef[team]);
    }

    // Fetch this week's games from CFBD
    const gamesRes = await getGames({ query: { year: season, week } });
    const gameList: any[] = gamesRes.data || [];

    const p4Set = new Set(p4Teams);
    const opponentMap: Record<string, string> = {};
    for (const g of gameList) {
      const home = g.homeTeam as string;
      const away = g.awayTeam as string;
      if (p4Set.has(home) && p4Set.has(away)) {
        opponentMap[home] = away;
        opponentMap[away] = home;
      }
    }

    return NextResponse.json(
      { week, season, opponentMap, offPct, defPct },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } }
    );
  } catch (err: any) {
    console.error('matchup-context error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
