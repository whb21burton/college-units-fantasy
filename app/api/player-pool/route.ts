/**
 * GET /api/player-pool
 *
 * Builds the draft-eligible player pool from Supabase cached_stats.
 * Aggregates season totals per school+unit, ranks them, and returns DraftUnit[].
 *
 * Guarantee: every school in CONFERENCES appears for every unit type.
 * Priority:  (1) live cached_stats data  (2) FULL_POOL projection  (3) pts=0 placeholder
 * Sort:      live-data schools rank above projection-only schools within each unit type.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { CONFERENCES, FULL_POOL, type DraftUnit, type UnitType, type Tier, type Conference } from '@/lib/playerPool';

const SEASON          = 2025;
const TOTAL_WEEKS     = 14; // regular season length used to project avg → full season
const UNIT_TYPES: UnitType[] = ['QB', 'RB', 'WR', 'TE', 'DEF', 'K'];

function tierFromRank(rank: number, total: number): Tier {
  const pct = rank / total;
  if (pct <= 0.30) return 'Elite';
  if (pct <= 0.65) return 'Solid';
  return 'Depth';
}

function uid(school: string, unitType: UnitType) {
  return `${school}-${unitType}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const confParam  = searchParams.get('conference') ?? null; // "SEC" or "SEC,ACC,Big Ten" or null = all
    const confFilter = confParam; // kept as original name for compat
    const confList   = confParam ? confParam.split(',').map(c => c.trim()).filter(Boolean) : null;

    const admin = createAdminClient();

    // Build school→conference lookup from CONFERENCES constant
    const schoolConf: Record<string, Conference> = {};
    for (const [conf, schools] of Object.entries(CONFERENCES) as [Conference, string[]][]) {
      for (const s of schools) schoolConf[s] = conf;
    }

    // Build FULL_POOL lookup: school+unitType → projectedPoints (first entry per key wins)
    const fullPoolMap: Record<string, number> = {};
    for (const unit of FULL_POOL) {
      const key = `${unit.school}||${unit.unitType}`;
      if (!(key in fullPoolMap)) fullPoolMap[key] = unit.projectedPoints;
    }

    // Fetch all unit-level rows for the season — high limit, no week filter needed
    const { data, error } = await admin
      .from('cached_stats')
      .select('school, stat_type, value')
      .eq('season', SEASON)
      .in('stat_type', ['unit_QB', 'unit_RB', 'unit_WR', 'unit_TE', 'unit_DEF', 'unit_K'])
      .is('player_name', null)
      .limit(100000);

    // Derive QB and K starters from actual game performance:
    // top passer by cumulative passing_YDS, top kicker by cumulative kicking_PTS.
    // This is more reliable than depth_chart_position which is always null in the DB.
    const { data: playerStatRows } = await admin
      .from('cached_stats')
      .select('school, player_name, stat_type, value')
      .eq('season', SEASON)
      .in('stat_type', ['passing_YDS', 'kicking_PTS'])
      .not('player_name', 'is', null);

    const qbYards: Record<string, Record<string, number>> = {};
    const kPts:    Record<string, Record<string, number>> = {};
    for (const row of playerStatRows ?? []) {
      if (!row.player_name || !row.school) continue;
      if (row.stat_type === 'passing_YDS') {
        if (!qbYards[row.school]) qbYards[row.school] = {};
        qbYards[row.school][row.player_name] = (qbYards[row.school][row.player_name] ?? 0) + (row.value ?? 0);
      } else {
        if (!kPts[row.school]) kPts[row.school] = {};
        kPts[row.school][row.player_name] = (kPts[row.school][row.player_name] ?? 0) + (row.value ?? 0);
      }
    }

    const starterMap: Record<string, string> = {};
    for (const [school, players] of Object.entries(qbYards)) {
      const top = Object.entries(players).sort((a, b) => b[1] - a[1])[0];
      if (top) starterMap[`${school}||QB`] = top[0];
    }
    for (const [school, players] of Object.entries(kPts)) {
      const top = Object.entries(players).sort((a, b) => b[1] - a[1])[0];
      if (top) starterMap[`${school}||K`] = top[0];
    }

    if (error) throw error;

    // Aggregate per-week average from live data, keyed by school||unitType.
    // Track both sum and count so we can compute avgPerWeek = sum / weeksPlayed,
    // then project to a full 14-week season: projectedSeason = avgPerWeek * TOTAL_WEEKS.
    // This ensures projectedPoints always reflects actual performance pace rather
    // than the season cumulative total (which grows each week and can't be compared
    // fairly against the static FULL_POOL 14-week projections).
    const liveSums:   Record<string, number> = {};
    const liveCounts: Record<string, number> = {};
    for (const row of data ?? []) {
      if (!schoolConf[row.school]) continue; // skip non-P4+Ind schools
      const unitType = row.stat_type.replace('unit_', '') as UnitType;
      const key = `${row.school}||${unitType}`;
      liveSums[key]   = (liveSums[key]   ?? 0) + (row.value ?? 0);
      liveCounts[key] = (liveCounts[key] ?? 0) + 1;
    }

    // Build complete pool: every CONFERENCES school × every unit type, no gaps
    type Entry = { school: string; unitType: UnitType; pts: number; seasonTotal: number; isLive: boolean };
    const allEntries: Entry[] = [];

    for (const [conf, schools] of Object.entries(CONFERENCES) as [Conference, string[]][]) {
      if (confList && !confList.includes(conf)) continue; // skip conferences not in filter list
      for (const school of schools) {
        for (const unitType of UNIT_TYPES) {
          const key = `${school}||${unitType}`;
          if (key in liveSums) {
            // Project from actual avg for display; keep raw sum for ranking
            const avgPerWeek = liveSums[key] / liveCounts[key];
            allEntries.push({ school, unitType, pts: avgPerWeek * TOTAL_WEEKS, seasonTotal: liveSums[key], isLive: true });
          } else {
            // Fall back to FULL_POOL static 14-week season projection
            const fp = fullPoolMap[key] ?? 0;
            allEntries.push({ school, unitType, pts: fp, seasonTotal: fp, isLive: false });
          }
        }
      }
    }

    // Group by unit type; within each group sort live-data first, then by seasonTotal desc
    const byUnit: Record<UnitType, Entry[]> = { QB: [], RB: [], WR: [], TE: [], DEF: [], K: [] };
    for (const entry of allEntries) byUnit[entry.unitType].push(entry);
    for (const arr of Object.values(byUnit)) {
      arr.sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return b.seasonTotal - a.seasonTotal;
      });
    }

    // Build global ADP by interleaving across all unit types, live first then projection
    const allUnits = (Object.entries(byUnit) as [UnitType, Entry[]][])
      .flatMap(([unitType, arr]) => arr.map(u => ({ ...u, unitType })))
      .sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return b.seasonTotal - a.seasonTotal;
      });

    const adpMap = new Map<string, number>();
    allUnits.forEach((u, i) => adpMap.set(`${u.school}||${u.unitType}`, i + 1));

    // Assemble DraftUnit[]
    const pool: DraftUnit[] = [];
    for (const [unitType, arr] of Object.entries(byUnit) as [UnitType, Entry[]][]) {
      arr.forEach(({ school, pts, seasonTotal }, rank) => {
        const conf = schoolConf[school];
        if (!conf) return;
        const starterName = (unitType === 'QB' || unitType === 'K')
          ? (starterMap[`${school}||${unitType}`] ?? undefined)
          : undefined;
        pool.push({
          id:              uid(school, unitType),
          school,
          conference:      conf,
          unitType,
          playerName:      starterName,
          tier:            tierFromRank(rank, arr.length),
          adp:             adpMap.get(`${school}||${unitType}`) ?? rank + 1,
          projectedPoints: Math.round(pts),
          seasonTotal:     Math.round(seasonTotal),
        });
      });
    }

    // Sort by seasonTotal desc (actual points); ADP ascending as tiebreaker
    pool.sort((a, b) => {
      const diff = (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0);
      return diff !== 0 ? diff : a.adp - b.adp;
    });

    return NextResponse.json(pool, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('player-pool error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
