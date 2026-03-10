/**
 * GET /api/game-stats?week=N&season=YYYY
 *
 * Returns actual fantasy points scored for each school's units in a given week,
 * plus the list of schools whose game is completed.
 *
 * For completed games  → use actual CFBD box score stats.
 * For future/incomplete games → school will NOT appear in completedSchools;
 *   the UI should fall back to projections.
 *
 * No SOS or OR multiplier is applied — actual scores are raw reality.
 */
import { NextResponse } from 'next/server';
import { initCfbdClient } from '@/lib/cfbd-client';
import type { UnitType } from '@/lib/playerPool';

const pkg = require('cfbd');
const { getGames, getGamePlayerStats, getGameTeamStats } = pkg;

const SEASON = 2025;

// Same scoring constants as player-pool/route.ts
const S = {
  passYd: 0.05, passTd: 4,  int: -2,
  rushYd: 0.05, rushTd: 6,
  recYd:  0.05, recTd:  6,
  sack:   1,    defInt: 2,  fumRec: 2, defTd: 6,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const week   = parseInt(searchParams.get('week')   || '1', 10);
  const season = parseInt(searchParams.get('season') || String(SEASON), 10);

  try {
    initCfbdClient();

    const [gameList, playerGames, teamGames] = await Promise.all([
      getGames({ query: { year: season, week } }).then((r: any) => r.data || []),
      getGamePlayerStats({ query: { year: season, week } }).then((r: any) => r.data || []).catch(() => []),
      getGameTeamStats({ query: { year: season, week } }).then((r: any) => r.data || []).catch(() => []),
    ]);

    // ── Identify completed schools ────────────────────────────
    const completedSchools = new Set<string>();
    for (const g of gameList as any[]) {
      if (g.homePoints != null && g.awayPoints != null) {
        completedSchools.add(g.homeTeam);
        completedSchools.add(g.awayTeam);
      }
    }

    // ── Parse team game stats ─────────────────────────────────
    // getGameTeamStats returns: [{ id, teams: [{ school, stats: [{ category, stat }] }] }]
    const teamStat: Record<string, Record<string, number>> = {};
    for (const game of teamGames as any[]) {
      for (const teamEntry of (game.teams || [])) {
        const school: string = teamEntry.school ?? teamEntry.team ?? '';
        if (!school) continue;
        if (!teamStat[school]) teamStat[school] = {};
        for (const s of (teamEntry.stats || [])) {
          teamStat[school][s.category] = parseFloat(s.stat) || 0;
        }
      }
    }

    // ── Parse player game stats ───────────────────────────────
    // getGamePlayerStats returns: [{ id, teams: [{ school, categories: [{ name, types: [{ name, athletes: [{name, stat}] }] }] }] }]
    type PlayerEntry = Record<string, any>;
    const playerMap: Record<string, PlayerEntry> = {};

    for (const game of playerGames as any[]) {
      for (const teamEntry of (game.teams || [])) {
        const school: string = teamEntry.school ?? teamEntry.team ?? '';
        if (!school) continue;
        for (const cat of (teamEntry.categories || [])) {
          const category: string = cat.name; // 'passing', 'rushing', 'receiving', 'kicking'
          for (const type of (cat.types || [])) {
            const statType: string = type.name; // 'YDS', 'TD', 'INT', etc.
            for (const athlete of (type.athletes || [])) {
              const player: string = athlete.name ?? '';
              const key = `${school}||${player}||${category}`;
              if (!playerMap[key]) {
                playerMap[key] = { school, player, category };
              }
              playerMap[key][statType] = (playerMap[key][statType] || 0) + (parseFloat(athlete.stat) || 0);
            }
          }
        }
      }
    }

    const playerEntries = Object.values(playerMap);

    // ── Calculate actual fantasy points per school ────────────
    const schoolPoints: Record<string, Partial<Record<UnitType, number>>> = {};

    const addPts = (school: string, unit: UnitType, pts: number) => {
      if (!schoolPoints[school]) schoolPoints[school] = {};
      schoolPoints[school][unit] = Math.round(((schoolPoints[school][unit] || 0) + pts) * 10) / 10;
    };

    // QB: top passer by passing yards
    const qbPassers = playerEntries.filter(e => e.category === 'passing');
    const qbRushers = playerEntries.filter(e => e.category === 'rushing');

    const qbRushMap: Record<string, { YDS: number; TD: number }> = {};
    for (const r of qbRushers) {
      // Only count QB rushing (check if this player also has passing entry)
      const passerKey = `${r.school}||${r.player}||passing`;
      if (!playerMap[passerKey]) continue; // skip non-QBs in rushing
      const k = `${r.school}||${r.player}`;
      if (!qbRushMap[k]) qbRushMap[k] = { YDS: 0, TD: 0 };
      qbRushMap[k].YDS += r.YDS || 0;
      qbRushMap[k].TD  += r.TD  || 0;
    }

    const topQbPerTeam: Record<string, any> = {};
    for (const qb of qbPassers) {
      const curr = topQbPerTeam[qb.school];
      if (!curr || (qb.YDS || 0) > (curr.YDS || 0)) topQbPerTeam[qb.school] = qb;
    }

    for (const [school, qb] of Object.entries(topQbPerTeam)) {
      const rush = qbRushMap[`${school}||${qb.player}`] || { YDS: 0, TD: 0 };
      addPts(school, 'QB',
        (qb.YDS || 0) * S.passYd +
        (qb.TD  || 0) * S.passTd +
        (qb.INT || 0) * S.int    +
        rush.YDS      * S.rushYd +
        rush.TD       * S.rushTd
      );
    }

    // RB: team rushing totals from team game stats
    for (const [school, ts] of Object.entries(teamStat)) {
      addPts(school, 'RB',
        (ts.rushingYards || 0) * S.rushYd +
        (ts.rushingTDs   || 0) * S.rushTd
      );
    }

    // WR: aggregate receiving from all WR entries
    const wrReceivers = playerEntries.filter(e => e.category === 'receiving');
    // We can't distinguish WR from TE/RB purely from player game stats without position.
    // Use separate WR vs TE scoring buckets based on team game stats if available,
    // otherwise split from player entries using a position lookup fallback.
    // For now aggregate all receivers under WR and TE using team totals approach:
    // Team passing yards split: use team stats netPassingYards if available, else player sum.
    for (const recv of wrReceivers) {
      // We don't have position in game player stats structure — split evenly:
      // Heuristic: if player also has rushing entry, more likely RB/TE; otherwise WR.
      // Best effort: attribute to WR unit (team-level unit not individual).
      addPts(recv.school, 'WR',
        (recv.YDS || 0) * S.recYd +
        (recv.TD  || 0) * S.recTd
      );
    }

    // TE: use team passing stats to compute a TE share
    // Since getGamePlayerStats doesn't include position, we can't distinguish WR from TE.
    // Set TE to 0 for actual scores — the WR unit captures all receiving.
    // TODO: if CFBD adds position to game player stats, split WR/TE properly.

    // DEF: team defensive stats
    for (const [school, ts] of Object.entries(teamStat)) {
      addPts(school, 'DEF',
        (ts.sacks             || 0) * S.sack   +
        (ts.passesIntercepted || 0) * S.defInt +
        (ts.fumblesRecovered  || 0) * S.fumRec +
        (ts.interceptionTDs   || 0) * S.defTd  +
        (ts.fumbleReturnTDs   || 0) * S.defTd
      );
    }

    // K: top kicker by PTS
    const kickers = playerEntries.filter(e => e.category === 'kicking');
    const topKPerTeam: Record<string, any> = {};
    for (const k of kickers) {
      const curr = topKPerTeam[k.school];
      if (!curr || (k.PTS || 0) > (curr.PTS || 0)) topKPerTeam[k.school] = k;
    }
    for (const [school, k] of Object.entries(topKPerTeam)) {
      addPts(school, 'K', k.PTS || 0);
    }

    return NextResponse.json(
      { week, season, completedSchools: Array.from(completedSchools), schoolPoints },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (err: any) {
    console.error('game-stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
