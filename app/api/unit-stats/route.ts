/**
 * GET /api/unit-stats?school=X&unitType=Y&season=2025
 *
 * Returns week-by-week game log stats for a school's fantasy unit.
 * Reads from Supabase cache (cached_stats + cached_schedule).
 * NEVER calls the CFBD API directly — data is populated by cron jobs.
 */
import { NextResponse } from 'next/server';
import { getSchoolWeekGameLog } from '@/lib/sportsDataReader';
import { createAdminClient } from '@/lib/supabase-server';
import type { UnitType } from '@/lib/playerPool';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const school   = searchParams.get('school')   ?? '';
  const unitType = (searchParams.get('unitType') ?? '') as UnitType;
  const season   = parseInt(searchParams.get('season') || '2025', 10);

  if (!school || !unitType) {
    return NextResponse.json({ error: 'school and unitType required' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    const ROLE_WEIGHTS: Record<string, number> = {
      rb1_opportunity: 1.0, rb2_opportunity: 0.7, rb3_opportunity: 0.4,
    };

    const [weeks, playersRes, roleRows] = await Promise.all([
      getSchoolWeekGameLog(school, unitType, season),
      admin
        .from('cached_players')
        .select('player_name, jersey_number')
        .eq('school', school)
        .eq('position', unitType),   // position stored as 'QB','RB','WR','TE','K'
      // Fetch RB role rows only when unitType is RB (no-op for others)
      unitType === 'RB'
        ? admin
            .from('cached_stats')
            .select('player_name, stat_type, value')
            .eq('school', school)
            .eq('season', season)
            .in('stat_type', ['rb1_opportunity', 'rb2_opportunity', 'rb3_opportunity'])
            .not('player_name', 'is', null)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const jerseyMap: Record<string, string> = {};
    for (const p of playersRes.data ?? []) {
      if (p.player_name && p.jersey_number != null) {
        jerseyMap[p.player_name] = String(p.jersey_number);
      }
    }

    // Build playerRoles: aggregate rb1/rb2/rb3 opportunity across the season.
    // Each role's values are averaged; we pick the most common player_name for each role.
    type PlayerRole = { role: string; playerName: string; seasonOpportunity: number; multiplier: number };
    let playerRoles: PlayerRole[] = [];
    if (unitType === 'RB' && roleRows.data && roleRows.data.length > 0) {
      const byRole: Record<string, { nameCounts: Record<string, number>; vals: number[] }> = {};
      for (const row of roleRows.data) {
        if (!row.stat_type || !row.player_name) continue;
        if (!byRole[row.stat_type]) byRole[row.stat_type] = { nameCounts: {}, vals: [] };
        byRole[row.stat_type].nameCounts[row.player_name] =
          (byRole[row.stat_type].nameCounts[row.player_name] ?? 0) + 1;
        byRole[row.stat_type].vals.push(row.value ?? 0);
      }
      const ROLE_ORDER = ['rb1_opportunity', 'rb2_opportunity', 'rb3_opportunity'];
      const ROLE_LABELS = ['RB1', 'RB2', 'RB3'];
      for (let i = 0; i < ROLE_ORDER.length; i++) {
        const key = ROLE_ORDER[i];
        const entry = byRole[key];
        if (!entry || entry.vals.length === 0) continue;
        const topName = Object.entries(entry.nameCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        const avgOpp = entry.vals.reduce((s, v) => s + v, 0) / entry.vals.length;
        playerRoles.push({
          role: ROLE_LABELS[i],
          playerName: topName,
          seasonOpportunity: Math.round(avgOpp * 1000) / 10, // as percentage
          multiplier: ROLE_WEIGHTS[key],
        });
      }
    }

    return NextResponse.json(
      { school, unitType, weeks, jerseyMap, playerRoles },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    console.error('unit-stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
