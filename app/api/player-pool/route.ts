/**
 * GET /api/player-pool
 *
 * Builds the draft-eligible player pool from Supabase cached_stats.
 * Aggregates season totals per school+unit, ranks them, and returns DraftUnit[].
 * Never calls CFBD directly.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { CONFERENCES, type DraftUnit, type UnitType, type Tier, type Conference } from '@/lib/playerPool';

const SEASON = 2025;

function tierFromRank(rank: number, total: number): Tier {
  const pct = rank / total;
  if (pct <= 0.30) return 'Elite';
  if (pct <= 0.65) return 'Solid';
  return 'Depth';
}

function uid(school: string, unitType: UnitType) {
  return `${school}-${unitType}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function GET() {
  try {
    const admin = createAdminClient();

    // Sum unit fantasy points across all weeks per school+unit
    const { data, error } = await admin
      .from('cached_stats')
      .select('school, stat_type, value')
      .eq('season', SEASON)
      .in('stat_type', ['unit_QB', 'unit_RB', 'unit_WR', 'unit_TE', 'unit_DEF', 'unit_K'])
      .is('player_name', null)
      .limit(50000);

    if (error) throw error;

    // Build school→conference lookup from CONFERENCES constant
    const schoolConf: Record<string, Conference> = {};
    for (const [conf, schools] of Object.entries(CONFERENCES) as [Conference, string[]][]) {
      for (const s of schools) schoolConf[s] = conf;
    }

    // Aggregate season totals: school+unitType → total points
    const totals: Record<string, { school: string; unitType: UnitType; pts: number }> = {};
    for (const row of data ?? []) {
      const conf = schoolConf[row.school];
      if (!conf) continue; // skip non-P4+Ind schools
      const unitType = row.stat_type.replace('unit_', '') as UnitType;
      const key = `${row.school}||${unitType}`;
      if (!totals[key]) totals[key] = { school: row.school, unitType, pts: 0 };
      totals[key].pts += row.value ?? 0;
    }

    // Group by unit type and sort by total pts desc
    const byUnit: Record<UnitType, { school: string; pts: number }[]> = {
      QB: [], RB: [], WR: [], TE: [], DEF: [], K: [],
    };
    for (const { school, unitType, pts } of Object.values(totals)) {
      byUnit[unitType].push({ school, pts });
    }
    for (const arr of Object.values(byUnit)) arr.sort((a, b) => b.pts - a.pts);

    // Build global ADP by interleaving all units sorted by pts
    const allUnits = (Object.entries(byUnit) as [UnitType, { school: string; pts: number }[]][])
      .flatMap(([unitType, arr]) => arr.map(u => ({ ...u, unitType })))
      .sort((a, b) => b.pts - a.pts);

    const adpMap = new Map<string, number>();
    allUnits.forEach((u, i) => adpMap.set(`${u.school}||${u.unitType}`, i + 1));

    // Assemble DraftUnit[]
    const pool: DraftUnit[] = [];
    for (const [unitType, arr] of Object.entries(byUnit) as [UnitType, { school: string; pts: number }[]][]) {
      arr.forEach(({ school, pts }, rank) => {
        const conf = schoolConf[school];
        if (!conf) return;
        pool.push({
          id:              uid(school, unitType),
          school,
          conference:      conf,
          unitType,
          tier:            tierFromRank(rank, arr.length),
          adp:             adpMap.get(`${school}||${unitType}`) ?? rank + 1,
          projectedPoints: Math.round(pts),
        });
      });
    }

    // Sort by ADP ascending
    pool.sort((a, b) => a.adp - b.adp);

    return NextResponse.json(pool, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('player-pool error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
