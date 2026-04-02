/**
 * GET /api/unit-stats?school=X&unitType=Y&season=2025
 *
 * Returns week-by-week game log stats for a school's fantasy unit.
 * Reads from Supabase cache (cached_stats + cached_schedule).
 * NEVER calls the CFBD API directly — data is populated by cron jobs.
 *
 * Optional: ?breakdown=true&week=N
 * Returns per-player breakdown for one week including opportunity scores,
 * raw pts, and weighted pts per role (RB1/RB2/RB3, WR1/WR2/WR3, TE1/TE2).
 */
import { NextResponse } from 'next/server';
import { getSchoolWeekGameLog } from '@/lib/sportsDataReader';
import { createAdminClient } from '@/lib/supabase-server';
import type { UnitType } from '@/lib/playerPool';

export const dynamic = 'force-dynamic';

// Role config: stat_type → role label + multiplier
const UNIT_ROLES: Record<string, { stat: string; role: string; mult: number }[]> = {
  RB: [
    { stat: 'rb1_opportunity', role: 'RB1', mult: 1.0 },
    { stat: 'rb2_opportunity', role: 'RB2', mult: 0.7 },
    { stat: 'rb3_opportunity', role: 'RB3', mult: 0.4 },
  ],
  WR: [
    { stat: 'wr1_opportunity', role: 'WR1', mult: 1.0 },
    { stat: 'wr2_opportunity', role: 'WR2', mult: 0.8 },
    { stat: 'wr3_opportunity', role: 'WR3', mult: 0.7 },
  ],
  TE: [
    { stat: 'te1_opportunity', role: 'TE1', mult: 1.0 },
    { stat: 'te2_opportunity', role: 'TE2', mult: 0.5 },
  ],
};

const S = { rushYd: 0.1, rushTd: 6, rec: 1.0, recYd: 0.1, recTd: 6 };

function calcRawPts(stats: Record<string, number>, ut: string): number {
  if (ut === 'RB') {
    return (stats['rushing_YDS']   ?? 0) * S.rushYd
         + (stats['rushing_TD']    ?? 0) * S.rushTd
         + (stats['receiving_REC'] ?? 0) * S.rec
         + (stats['receiving_YDS'] ?? 0) * S.recYd
         + (stats['receiving_TD']  ?? 0) * S.recTd;
  }
  if (ut === 'WR' || ut === 'TE') {
    return (stats['receiving_REC'] ?? 0) * S.rec
         + (stats['receiving_YDS'] ?? 0) * S.recYd
         + (stats['receiving_TD']  ?? 0) * S.recTd;
  }
  return 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const school    = searchParams.get('school')   ?? '';
  const unitType  = (searchParams.get('unitType') ?? '') as UnitType;
  const season    = parseInt(searchParams.get('season') || '2025', 10);
  const breakdown = searchParams.get('breakdown') === 'true';
  const weekParam = searchParams.get('week') ? parseInt(searchParams.get('week')!, 10) : null;

  if (!school || !unitType) {
    return NextResponse.json({ error: 'school and unitType required' }, { status: 400 });
  }

  const NO_STORE = { 'Cache-Control': 'no-store' };

  try {
    const admin = createAdminClient();

    // ── Breakdown mode: single-week player breakdown ──────────────────────────
    if (breakdown && weekParam) {
      const roles = UNIT_ROLES[unitType] ?? [];
      if (roles.length === 0) {
        return NextResponse.json({ breakdown: null }, { headers: NO_STORE });
      }

      // Resolve game_id for this week
      const { data: schedRow } = await admin
        .from('cached_schedule')
        .select('game_id')
        .eq('season', season)
        .eq('week', weekParam)
        .or(`home_team.eq.${school},away_team.eq.${school}`)
        .maybeSingle();

      if (!schedRow?.game_id) {
        return NextResponse.json({ breakdown: null }, { headers: NO_STORE });
      }

      const gameId = schedRow.game_id;
      const roleStatTypes = roles.map(r => r.stat);

      // Fetch role rows for this game (player_name = the ranked player, value = opportunity share)
      const { data: roleData } = await admin
        .from('cached_stats')
        .select('player_name, stat_type, value')
        .eq('school', school)
        .eq('game_id', gameId)
        .in('stat_type', roleStatTypes)
        .not('player_name', 'is', null);

      if (!roleData || roleData.length === 0) {
        return NextResponse.json({ breakdown: null }, { headers: NO_STORE });
      }

      // Build stat_type → { playerName, oppScore } (first row per stat_type wins)
      const rolePlayerMap: Record<string, { playerName: string; oppScore: number }> = {};
      for (const row of roleData) {
        if (!row.player_name || rolePlayerMap[row.stat_type]) continue;
        rolePlayerMap[row.stat_type] = {
          playerName: row.player_name,
          oppScore:   row.value ?? 0,
        };
      }

      // Fetch individual stats for those players in this game
      const playerNamesSet: Record<string, true> = {};
      for (const v of Object.values(rolePlayerMap)) playerNamesSet[v.playerName] = true;
      const playerNames = Object.keys(playerNamesSet);
      const { data: statRows } = await admin
        .from('cached_stats')
        .select('player_name, stat_type, value')
        .eq('school', school)
        .eq('game_id', gameId)
        .in('player_name', playerNames)
        .not('player_name', 'is', null);

      const playerStats: Record<string, Record<string, number>> = {};
      for (const row of statRows ?? []) {
        if (!row.player_name) continue;
        if (!playerStats[row.player_name]) playerStats[row.player_name] = {};
        playerStats[row.player_name][row.stat_type] = row.value ?? 0;
      }

      const breakdownRows = roles
        .filter(r => rolePlayerMap[r.stat])
        .map(r => {
          const { playerName, oppScore } = rolePlayerMap[r.stat];
          const stats   = playerStats[playerName] ?? {};
          const rawPts  = calcRawPts(stats, unitType);
          return {
            role:        r.role,
            playerName,
            oppScore:    Math.round(oppScore * 1000) / 1000,
            multiplier:  r.mult,
            rawPts:      Math.round(rawPts * 10) / 10,
            weightedPts: Math.round(rawPts * r.mult * 10) / 10,
          };
        });

      return NextResponse.json(
        { breakdown: breakdownRows.length > 0 ? breakdownRows : null },
        { headers: NO_STORE },
      );
    }

    // ── Normal mode: full season game log ─────────────────────────────────────
    const ROLE_WEIGHTS: Record<string, number> = {
      rb1_opportunity: 1.0, rb2_opportunity: 0.7, rb3_opportunity: 0.4,
    };

    const [weeks, playersRes, roleRows] = await Promise.all([
      getSchoolWeekGameLog(school, unitType, season),
      admin
        .from('cached_players')
        .select('player_name, jersey_number')
        .eq('school', school)
        .eq('position', unitType),
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
      const ROLE_ORDER  = ['rb1_opportunity', 'rb2_opportunity', 'rb3_opportunity'];
      const ROLE_LABELS = ['RB1', 'RB2', 'RB3'];
      for (let i = 0; i < ROLE_ORDER.length; i++) {
        const key   = ROLE_ORDER[i];
        const entry = byRole[key];
        if (!entry || entry.vals.length === 0) continue;
        const topName = Object.entries(entry.nameCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        const avgOpp  = entry.vals.reduce((s, v) => s + v, 0) / entry.vals.length;
        playerRoles.push({
          role:              ROLE_LABELS[i],
          playerName:        topName,
          seasonOpportunity: Math.round(avgOpp * 1000) / 10,
          multiplier:        ROLE_WEIGHTS[key],
        });
      }
    }

    return NextResponse.json(
      { school, unitType, weeks, jerseyMap, playerRoles },
      { headers: NO_STORE },
    );
  } catch (err: any) {
    console.error('unit-stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
