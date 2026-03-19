/**
 * lib/sportsDataReader.ts
 *
 * Frontend-safe reader functions — reads from Supabase ONLY.
 * NEVER calls the CFBD API directly.
 *
 * Import this in API routes / server components instead of cfbd-client.
 */

import { createAdminClient } from '@/lib/supabase-server';
import { FULL_POOL, CONFERENCES, type UnitType, type DraftUnit } from '@/lib/playerPool';

// ── getScoresForWeek ─────────────────────────────────────────────────────────
export async function getScoresForWeek(week: number, season: number) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cached_scores')
    .select('*')
    .eq('week', week)
    .eq('season', season)
    .order('start_time');

  if (error) throw error;
  return data ?? [];
}

// ── getScheduleForTeam ───────────────────────────────────────────────────────
export async function getScheduleForTeam(school: string, season: number) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cached_schedule')
    .select('*')
    .or(`home_team.eq.${school},away_team.eq.${school}`)
    .eq('season', season)
    .order('week');

  if (error) throw error;
  return data ?? [];
}

// ── getRosterForTeam ─────────────────────────────────────────────────────────
export async function getRosterForTeam(school: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cached_players')
    .select('*')
    .eq('school', school)
    .order('position')
    .order('depth_chart_position');

  if (error) throw error;
  return data ?? [];
}

// ── getStatsForWeek ──────────────────────────────────────────────────────────
// Returns all stats rows for a given week, keyed by school.
// Callers can filter by stat_type (e.g. 'unit_QB') to get unit fantasy points.
export async function getStatsForWeek(week: number, season: number) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cached_stats')
    .select('school, game_id, player_name, stat_type, value')
    .eq('week', week)
    .eq('season', season);

  if (error) throw error;
  return data ?? [];
}

// ── getUnitPointsForWeek ─────────────────────────────────────────────────────
// Returns precomputed unit fantasy points for all schools for a given week.
// Returns: { [school]: { QB, RB, WR, TE, DEF, K } }
export async function getUnitPointsForWeek(
  week: number,
  season: number,
): Promise<Record<string, Partial<Record<UnitType, number>>>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cached_stats')
    .select('school, stat_type, value')
    .eq('week', week)
    .eq('season', season)
    .like('stat_type', 'unit_%')
    .is('player_name', null)
    .limit(50000);

  const result: Record<string, Partial<Record<UnitType, number>>> = {};
  for (const row of data ?? []) {
    const unitType = row.stat_type.replace('unit_', '') as UnitType;
    if (!result[row.school]) result[row.school] = {};
    result[row.school][unitType] = row.value;
  }
  return result;
}

// ── getSchoolWeekGameLog ─────────────────────────────────────────────────────
// Returns week-by-week data for a school's unit, reading from cached tables.
// Mirrors the response shape of /api/unit-stats for drop-in compatibility.
export async function getSchoolWeekGameLog(
  school: string,
  unitType: UnitType,
  season: number,
): Promise<{
  week: number;
  opponent: string | null;
  completed: boolean;
  fantasyPoints: number | null;
  rawPoints: number | null;
  multiplier: number | null;
  players: any[];
}[]> {
  const admin = createAdminClient();
  const TOTAL_WEEKS = 14;

  // Fetch schedule + stats for this school in parallel
  const [scheduleRows, unitStatRows, playerStatRows] = await Promise.all([
    admin
      .from('cached_schedule')
      .select('week, home_team, away_team, game_id')
      .or(`home_team.eq.${school},away_team.eq.${school}`)
      .eq('season', season),
    admin
      .from('cached_stats')
      .select('week, stat_type, value')
      .eq('school', school)
      .eq('season', season)
      .or('stat_type.like.unit_%,stat_type.eq.game_mult')
      .is('player_name', null),
    admin
      .from('cached_stats')
      .select('week, game_id, player_name, stat_type, value')
      .eq('school', school)
      .eq('season', season)
      .not('player_name', 'is', null),
  ]);

  // Build lookup maps
  const scheduleByWeek: Record<number, { opponent: string; gameId: string }> = {};
  for (const row of scheduleRows.data ?? []) {
    scheduleByWeek[row.week] = {
      opponent: row.home_team === school ? row.away_team : row.home_team,
      gameId:   row.game_id,
    };
  }

  const unitPtsByWeek: Record<number, number> = {};
  const multByWeek:    Record<number, number> = {};
  for (const row of unitStatRows.data ?? []) {
    if (row.stat_type === `unit_${unitType}`) {
      unitPtsByWeek[row.week] = row.value;
    } else if (row.stat_type === 'game_mult') {
      multByWeek[row.week] = row.value;
    }
  }

  // Build player-stat lookup: week → player entries
  const playersByWeek: Record<number, Record<string, any>> = {};
  for (const row of playerStatRows.data ?? []) {
    if (!playersByWeek[row.week]) playersByWeek[row.week] = {};
    const key = `${row.player_name}||${row.stat_type.split('_')[0]}`;
    if (!playersByWeek[row.week][row.player_name]) {
      playersByWeek[row.week][row.player_name] = { name: row.player_name };
    }
    playersByWeek[row.week][row.player_name][row.stat_type] = row.value;
  }

  return Array.from({ length: TOTAL_WEEKS }, (_, i) => {
    const week     = i + 1;
    const sched    = scheduleByWeek[week];
    const opponent = sched?.opponent ?? null;
    const pts      = unitPtsByWeek[week];
    const completed = pts !== undefined;

    if (!completed) {
      return { week, opponent, completed: false, fantasyPoints: null, rawPoints: null, multiplier: null, players: [] };
    }

    // Build per-unit player list from cached stats
    const weekPlayers = Object.values(playersByWeek[week] ?? {});
    let players: any[] = [];

    switch (unitType) {
      case 'QB': {
        const qb = weekPlayers
          .filter(p => p['passing_YDS'] != null)
          .sort((a, b) => (b['passing_YDS'] || 0) - (a['passing_YDS'] || 0))[0];
        if (qb) {
          players = [{ name: qb.name, passYd: qb['passing_YDS'] || 0, passTd: qb['passing_TD'] || 0, int: qb['passing_INT'] || 0, rushYd: qb['rushing_YDS'] || 0, rushTd: qb['rushing_TD'] || 0 }];
        }
        break;
      }
      case 'RB': {
        players = weekPlayers
          .filter(p => p['rushing_YDS'] != null && p['passing_YDS'] == null)
          .sort((a, b) => (b['rushing_YDS'] || 0) - (a['rushing_YDS'] || 0))
          .slice(0, 4)
          .map(r => ({ name: r.name, rushAtt: r['rushing_ATT'] || 0, rushYd: r['rushing_YDS'] || 0, rushTd: r['rushing_TD'] || 0, rec: r['receiving_REC'] || 0, recYd: r['receiving_YDS'] || 0 }));
        break;
      }
      case 'WR':
      case 'TE': {
        players = weekPlayers
          .filter(p => p['receiving_YDS'] != null && p['passing_YDS'] == null)
          .sort((a, b) => (b['receiving_YDS'] || 0) - (a['receiving_YDS'] || 0))
          .slice(0, 5)
          .map(r => ({ name: r.name, rec: r['receiving_REC'] || 0, recYd: r['receiving_YDS'] || 0, recTd: r['receiving_TD'] || 0 }));
        break;
      }
      case 'DEF': {
        const defStats = playersByWeek[week]?.['__team__'] ?? {};
        players = [{ sacks: defStats['team_sacks'] || 0, ints: defStats['team_passesIntercepted'] || 0, fumRec: defStats['team_fumblesRecovered'] || 0, defTd: (defStats['team_interceptionTDs'] || 0) + (defStats['team_fumbleReturnTDs'] || 0) }];
        break;
      }
      case 'K': {
        const k = weekPlayers
          .filter(p => p['kicking_PTS'] != null)
          .sort((a, b) => (b['kicking_PTS'] || 0) - (a['kicking_PTS'] || 0))[0];
        if (k) players = [{ name: k.name, pts: k['kicking_PTS'] || 0 }];
        break;
      }
    }

    const mult      = multByWeek[week] ?? null;
    const rawPoints = mult && mult > 0 ? Math.round(pts / mult * 10) / 10 : pts;
    return { week, opponent, completed: true, fantasyPoints: pts, rawPoints, multiplier: mult, players };
  });
}

// ── getPlayerProjectedPoints ─────────────────────────────────────────────────
// Returns projected fantasy points for a school's unit.
// Uses season average from cached_stats if available, falls back to FULL_POOL.
export async function getPlayerProjectedPoints(
  school: string,
  unitType: UnitType,
  season: number = 2025,
): Promise<number> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('cached_stats')
    .select('value')
    .eq('school', school)
    .eq('season', season)
    .eq('stat_type', `unit_${unitType}`)
    .is('player_name', null)
    .gt('value', 0);

  if (data && data.length > 0) {
    const avg = data.reduce((s, r) => s + (r.value || 0), 0) / data.length;
    return Math.round(avg * 10) / 10;
  }

  // Fallback to static FULL_POOL projected points
  const unit = FULL_POOL.find(u => u.school === school && u.unitType === unitType);
  if (unit) return unit.projectedPoints / 14; // per-week
  return 0;
}

// ── getEnrichedPool ──────────────────────────────────────────────────────────
// Merges FULL_POOL static data with live cached_players depth chart info.
// Server-side only. Use instead of FULL_POOL when you need live depth charts.
export async function getEnrichedPool(
  conferences?: import('@/lib/playerPool').Conference[],
  teams?: string[],
): Promise<(DraftUnit & { depth_chart_position?: number | null })[]> {
  const admin = createAdminClient();

  let pool = FULL_POOL as (DraftUnit & { depth_chart_position?: number | null })[];
  if (conferences && conferences.length > 0) {
    pool = pool.filter(u => conferences.includes(u.conference));
  }
  if (teams && teams.length > 0) {
    pool = pool.filter(u => teams.includes(u.school));
  }

  const schools = Array.from(new Set(pool.map(u => u.school)));
  if (schools.length === 0) return pool;

  const { data: cachedPlayers } = await admin
    .from('cached_players')
    .select('school, position, player_name, depth_chart_position')
    .in('school', schools);

  if (!cachedPlayers || cachedPlayers.length === 0) return pool;

  const dcMap: Record<string, number | null> = {};
  for (const p of cachedPlayers) {
    dcMap[`${p.school}:${p.position}:${p.player_name}`] = p.depth_chart_position;
  }

  return pool.map(u => {
    const key = u.playerName
      ? `${u.school}:${u.unitType}:${u.playerName}`
      : `${u.school}:${u.unitType}:`;
    return { ...u, depth_chart_position: dcMap[key] ?? null };
  });
}

// ── getCompletedSchoolsForWeek ───────────────────────────────────────────────
// Returns schools whose game is completed for a given week.
export async function getCompletedSchoolsForWeek(week: number, season: number): Promise<string[]> {
  const { data } = await (createAdminClient())
    .from('cached_scores')
    .select('home_team, away_team')
    .eq('week', week)
    .eq('season', season)
    .eq('status', 'completed');

  const schools = new Set<string>();
  for (const row of data ?? []) {
    schools.add(row.home_team);
    schools.add(row.away_team);
  }
  return Array.from(schools);
}
