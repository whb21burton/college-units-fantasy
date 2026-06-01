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
const TOTAL_WEEKS     = 4; // weeks played so far — update as season progresses
const UNIT_TYPES: UnitType[] = ['QB', 'RB', 'WR', 'TE', 'DEF', 'K'];

// Normalize cached_stats school names to match CONFERENCES canonical names.
// Only alias names that CFBD returns differently from the CONFERENCES constant.
// Do NOT alias names that CONFERENCES already uses (e.g. 'Ole Miss' stays 'Ole Miss').
const SCHOOL_ALIASES: Record<string, string> = {
  'Pitt':                'Pittsburgh',  // CONFERENCES uses 'Pittsburgh'
  'Hawai\'i':            'Hawaii',
  'Miami (OH)':          'Miami (Ohio)',
};

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
    const confParam    = searchParams.get('conference') ?? null; // "SEC" or "SEC,ACC,Big Ten" or null = all
    const NO_FILTER_VALUES = ['all', 'ALL', 'All D1', 'all d1', ''];
    const rawConf = confParam ?? '';
    const confList = (rawConf && !NO_FILTER_VALUES.includes(rawConf))
      ? rawConf.split(',').map(c => c.trim()).filter(Boolean)
      : null;
    const schoolsParam = searchParams.get('schools') ?? null;
    const allowedSchools = schoolsParam ? schoolsParam.split(',').map(s => s.trim()).filter(Boolean) : null;

    const admin = createAdminClient();

    // Build school→conference lookup from CONFERENCES constant
    const schoolConf: Record<string, Conference> = {};
    for (const [conf, schools] of Object.entries(CONFERENCES) as [Conference, string[]][]) {
      for (const s of schools) schoolConf[s] = conf;
    }

    // Build FULL_POOL lookup: school+unitType → projectedPoints (first entry per key wins)
    const filteredPool = allowedSchools
      ? FULL_POOL.filter(p => allowedSchools.includes(p.school))
      : FULL_POOL;
    const fullPoolMap: Record<string, number> = {};
    for (const unit of filteredPool) {
      const key = `${unit.school}||${unit.unitType}`;
      if (!(key in fullPoolMap)) fullPoolMap[key] = unit.projectedPoints;
    }

    // Fetch unit-level rows for the season up to current week
    let query = admin
      .from('cached_stats')
      .select('school, stat_type, value')
      .eq('season', SEASON)
      .in('stat_type', ['unit_QB', 'unit_RB', 'unit_WR', 'unit_TE', 'unit_DEF', 'unit_K'])
      .is('player_name', null)
      .gt('value', 0)       // exclude bye weeks (0-score rows) from weeksPlayed count
      .lte('week', 4)
      .limit(100000);

    if (allowedSchools && allowedSchools.length > 0) {
      query = query.in('school', allowedSchools);
    }

    const { data, error } = await query;

    // ── RB pricing data: rb1_opportunity per school across all weeks ──────────
    const { data: rbOppRows } = await admin
      .from('cached_stats')
      .select('school, game_id, value')
      .eq('season', SEASON)
      .eq('stat_type', 'rb1_opportunity')
      .lte('week', 4)
      .not('player_name', 'is', null);   // role rows always have player_name set

    // Aggregate per-school: CI = avg rb1_opportunity; stability = fraction of weeks where ≥ 0.40
    const rbOppBySchool: Record<string, number[]> = {};
    for (const row of rbOppRows ?? []) {
      if (!row.school) continue;
      if (!rbOppBySchool[row.school]) rbOppBySchool[row.school] = [];
      rbOppBySchool[row.school].push(row.value ?? 0);
    }

    const rbPricingMultipliers = (school: string): { oppMult: number; stabMult: number; ci: number } => {
      const vals = rbOppBySchool[school];
      if (!vals || vals.length === 0) return { oppMult: 1.0, stabMult: 1.0, ci: 0 };
      const ci = vals.reduce((s, v) => s + v, 0) / vals.length;
      const oppMult = ci >= 0.65 ? 1.20 : ci >= 0.50 ? 1.10 : ci >= 0.35 ? 1.00 : 0.85;
      const stableWeeks = vals.filter(v => v >= 0.40).length;
      const stabMult = Math.max(0.80, Math.min(1.00, stableWeeks / vals.length));
      return { oppMult, stabMult, ci };
    }

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
    let debugMisses = 0;
    for (const row of data ?? []) {
      const canonicalSchool = SCHOOL_ALIASES[row.school] ?? row.school;
      if (!schoolConf[canonicalSchool]) {
        // Log first few unrecognized school names to catch future alias gaps
        if (debugMisses < 5) {
          console.log('[pool-debug] unrecognized school:', row.school, '→', canonicalSchool);
          debugMisses++;
        }
        continue;
      }
      const unitType = row.stat_type.replace('unit_', '') as UnitType;
      const key = `${canonicalSchool}||${unitType}`;
      liveSums[key]   = (liveSums[key]   ?? 0) + (row.value ?? 0);
      liveCounts[key] = (liveCounts[key] ?? 0) + 1;
    }

    const debugKey   = `Florida||QB`;
    const debugVal   = liveSums[debugKey];
    const debugCount = liveCounts[debugKey];
    const allKeys    = Object.keys(liveSums).slice(0, 10).join(', ');
    const totalKeys  = Object.keys(liveSums).length;
    console.log(`POOL_DEBUG: Florida||QB=${debugVal ?? 'MISSING'} weeks=${debugCount ?? 0} totalKeys=${totalKeys} sample=${allKeys}`);

    // Build complete pool: every CONFERENCES school × every unit type, no gaps
    type Entry = { school: string; unitType: UnitType; pts: number; seasonTotal: number; weeksPlayed: number; avgPerWeek: number; isLive: boolean };
    const allEntries: Entry[] = [];

    for (const [conf, schools] of Object.entries(CONFERENCES) as [Conference, string[]][]) {
      if (confList && !confList.includes(conf)) continue; // skip conferences not in filter list
      for (const school of schools) {
        if (allowedSchools && !allowedSchools.includes(school)) continue; // skip schools not in league
        for (const unitType of UNIT_TYPES) {
          const key = `${school}||${unitType}`;
          if (key in liveSums) {
            const weeksPlayed = liveCounts[key];
            const avgPerWeek  = liveSums[key] / weeksPlayed;
            allEntries.push({ school, unitType, pts: avgPerWeek * TOTAL_WEEKS, seasonTotal: liveSums[key], weeksPlayed, avgPerWeek, isLive: true });
          } else {
            // Fall back to FULL_POOL static 14-week season projection
            const fp = fullPoolMap[key] ?? 0;
            allEntries.push({ school, unitType, pts: fp, seasonTotal: fp, weeksPlayed: 0, avgPerWeek: 0, isLive: false });
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
      arr.forEach(({ school, pts, seasonTotal, weeksPlayed, avgPerWeek }, rank) => {
        const conf = schoolConf[school];
        if (!conf) return;
        const starterName = (unitType === 'QB' || unitType === 'K')
          ? (starterMap[`${school}||${unitType}`] ?? undefined)
          : undefined;

        let adjustedPts = pts;
        let badge: string | undefined;
        if (unitType === 'RB') {
          const { oppMult, stabMult, ci } = rbPricingMultipliers(school);
          adjustedPts = pts * oppMult * stabMult;
          badge = ci >= 0.65 ? '🐎 Workhorse' : ci < 0.50 && ci > 0 ? '👥 Committee' : undefined;
        }

        pool.push({
          id:              uid(school, unitType),
          school,
          conference:      conf,
          unitType,
          playerName:      starterName,
          tier:            tierFromRank(rank, arr.length),
          adp:             adpMap.get(`${school}||${unitType}`) ?? rank + 1,
          projectedPoints: seasonTotal > 0 ? Math.round(seasonTotal) : Math.round(adjustedPts),
          seasonTotal:     Math.round(seasonTotal * 10) / 10,
          weeksPlayed,
          avgPerWeek:      Math.round(avgPerWeek * 10) / 10,
          ...(badge ? { badge } : {}),
        });
      });
    }

    // Sort by seasonTotal desc (actual points); ADP ascending as tiebreaker
    pool.sort((a, b) => {
      const diff = (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0);
      return diff !== 0 ? diff : a.adp - b.adp;
    });

    // Deduplicate by school+unitType — keep entry with highest avgPerWeek (live data wins over projection)
    const deduped = new Map<string, DraftUnit>();
    for (const entry of pool) {
      const key = `${entry.school}||${entry.unitType}`;
      const existing = deduped.get(key);
      if (!existing || (entry.avgPerWeek ?? 0) > (existing.avgPerWeek ?? 0)) {
        deduped.set(key, entry);
      }
    }
    const dedupedPool = Array.from(deduped.values());

    return NextResponse.json(dedupedPool, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('player-pool error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
