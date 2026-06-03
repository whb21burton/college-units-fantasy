/**
 * lib/sportsDataReader.ts
 *
 * Frontend-safe reader functions — reads from Supabase ONLY.
 * NEVER calls the CFBD API directly.
 *
 * Import this in API routes / server components instead of cfbd-client.
 */

import { createAdminClient } from '@/lib/supabase-server';
import { FULL_POOL, type UnitType, type DraftUnit } from '@/lib/playerPool';

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
// Returns precomputed unit fantasy points AND stored multipliers for all schools.
// Returns: { schoolPoints: { [school]: { QB, RB, WR, TE, DEF, K } }, schoolMults: { [school]: number } }
//
// cached_stats rows have unreliable week column values, so we look up stats
// by game_id (sourced from cached_schedule) instead of filtering by week.
// This is the same approach getSchoolWeekGameLog uses and is the only
// reliable way to get data for a specific week.
export async function getUnitPointsForWeek(
  week: number,
  season: number,
): Promise<{
  schoolPoints: Record<string, Partial<Record<UnitType, number>>>;
  schoolMults:  Record<string, number>;
}> {
  const admin = createAdminClient();

  // Step 1: get game_ids for this week from cached_schedule (week column is reliable here)
  const { data: scheduleData } = await admin
    .from('cached_schedule')
    .select('game_id')
    .eq('week', week)
    .eq('season', season);

  const gameIds = (scheduleData ?? []).map((g: any) => g.game_id).filter(Boolean);

  if (gameIds.length === 0) {
    return { schoolPoints: {}, schoolMults: {} };
  }

  // Step 2: fetch all unit stats + multipliers by game_id — bypasses broken week column
  const STAT_TYPES = ['unit_QB', 'unit_RB', 'unit_WR', 'unit_TE', 'unit_DEF', 'unit_K', 'game_mult'];
  const { data } = await admin
    .from('cached_stats')
    .select('school, stat_type, value')
    .in('game_id', gameIds)
    .in('stat_type', STAT_TYPES)
    .is('player_name', null)
    .limit(50000);

  const rows = data ?? [];

  const schoolPoints: Record<string, Partial<Record<UnitType, number>>> = {};
  const schoolMults:  Record<string, number> = {};

  for (const row of rows) {
    if (row.stat_type === 'game_mult') {
      schoolMults[row.school] = row.value;
    } else {
      const unitType = row.stat_type.replace('unit_', '') as UnitType;
      if (!schoolPoints[row.school]) schoolPoints[row.school] = {};
      schoolPoints[row.school][unitType] = row.value;
    }
  }

  return { schoolPoints, schoolMults };
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
  const TOTAL_WEEKS = 4;

  // Fetch schedule, stats, and player positions in parallel
  const [scheduleRows, unitStatRows, playerStatRows, rosterRows] = await Promise.all([
    admin
      .from('cached_schedule')
      .select('week, home_team, away_team, game_id')
      .or(`home_team.eq.${school},away_team.eq.${school}`)
      .eq('season', season)
      .lte('week', 4),
    admin
      .from('cached_stats')
      .select('week, stat_type, value')
      .eq('school', school)
      .eq('season', season)
      .lte('week', 4)
      .in('stat_type', ['unit_QB', 'unit_RB', 'unit_WR', 'unit_TE', 'unit_DEF', 'unit_K', 'game_mult',
                        'def_sacks', 'def_ints', 'def_fum_rec', 'def_tds', 'def_safeties'])
      .is('player_name', null),
    admin
      .from('cached_stats')
      .select('week, game_id, player_name, stat_type, value')
      .eq('school', school)
      .eq('season', season)
      .lte('week', 4)
      .not('player_name', 'is', null),
    admin
      .from('cached_players')
      .select('player_name, position')
      .eq('school', school),
  ]);

  // Build player→position lookup from cached_players.
  // Normalize names: strip punctuation, lowercase, collapse spaces so
  // "T.J. Logan" (roster) matches "TJ Logan" (game stats).
  const normName = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  const playerPos: Record<string, string> = {};
  for (const row of rosterRows.data ?? []) {
    if (row.position) playerPos[normName(row.player_name)] = row.position;
  }

  // Build lookup maps
  const scheduleByWeek: Record<number, { opponent: string; gameId: string }> = {};
  const gameIdToWeek:   Record<string, number> = {};
  for (const row of scheduleRows.data ?? []) {
    scheduleByWeek[row.week] = {
      opponent: row.home_team === school ? row.away_team : row.home_team,
      gameId:   row.game_id,
    };
    if (row.game_id) gameIdToWeek[row.game_id] = row.week;
  }

  const unitPtsByWeek: Record<number, number> = {};
  const multByWeek:    Record<number, number> = {};
  const defStatsByWeek: Record<number, { sacks: number; ints: number; fumRec: number; defTd: number; safeties: number }> = {};
  for (const row of unitStatRows.data ?? []) {
    if (row.stat_type === `unit_${unitType}`) {
      unitPtsByWeek[row.week] = row.value;
    } else if (row.stat_type === 'game_mult') {
      multByWeek[row.week] = row.value;
    } else if (row.stat_type.startsWith('def_')) {
      if (!defStatsByWeek[row.week]) defStatsByWeek[row.week] = { sacks: 0, ints: 0, fumRec: 0, defTd: 0, safeties: 0 };
      const map: Record<string, keyof typeof defStatsByWeek[number]> = {
        def_sacks: 'sacks', def_ints: 'ints', def_fum_rec: 'fumRec', def_tds: 'defTd', def_safeties: 'safeties',
      };
      const field = map[row.stat_type];
      if (field) defStatsByWeek[row.week][field] = row.value;
    }
  }

  // Build player-stat lookup: week → player entries.
  // Use game_id → week mapping (cached_schedule week is reliable; cached_stats week is not).
  const playersByWeek: Record<number, Record<string, any>> = {};
  for (const row of playerStatRows.data ?? []) {
    const wk = row.game_id ? (gameIdToWeek[row.game_id] ?? null) : null;
    if (!wk) continue; // skip rows we can't reliably assign to a week
    if (!playersByWeek[wk]) playersByWeek[wk] = {};
    if (!playersByWeek[wk][row.player_name]) {
      playersByWeek[wk][row.player_name] = { name: row.player_name };
    }
    playersByWeek[wk][row.player_name][row.stat_type] = row.value;
  }

  return Array.from({ length: TOTAL_WEEKS }, (_, i) => {
    const week     = i + 1;
    const sched    = scheduleByWeek[week];
    const opponent = sched?.opponent ?? null;
    const pts      = unitPtsByWeek[week];
    const completed = pts !== undefined;

    // isBye = week exists in season but no game scheduled (true bye)
    // vs week simply not in schedule at all (also treat as bye for display)
    const isBye = pts === undefined  // no stats = not played = show as bye
    if (!completed) {
      return {
        week,
        opponent,
        completed: false,
        isBye: isBye,
        fantasyPoints: null,
        rawPoints: null,
        multiplier: null,
        players: []
      };
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
        // Use position data if available; fall back to "rusher who isn't a QB"
        const rbList = weekPlayers
          .filter(p => {
            const pos = playerPos[normName(p.name)];
            return pos ? pos === 'RB' : (p['rushing_YDS'] != null && p['passing_YDS'] == null);
          })
          .sort((a, b) => (b['rushing_YDS'] || 0) - (a['rushing_YDS'] || 0));
        if (rbList.length > 0) {
          // players[0] = nameless unit aggregate for game-log stat columns
          // players[1+] = individual named RBs for Unit Players season table
          players = [
            {
              rushAtt: rbList.reduce((s, p) => s + (p['rushing_ATT']  || 0), 0),
              rushYd:  rbList.reduce((s, p) => s + (p['rushing_YDS']  || 0), 0),
              // TD = rush TDs + receiving TDs for all RBs (unit scoring is inclusive)
              rushTd:  rbList.reduce((s, p) => s + (p['rushing_TD']   || 0) + (p['receiving_TD'] || 0), 0),
              rec:     rbList.reduce((s, p) => s + (p['receiving_REC']|| 0), 0),
              recYd:   rbList.reduce((s, p) => s + (p['receiving_YDS']|| 0), 0),
            },
            ...rbList.map(r => ({
              name:    r.name,
              rushAtt: r['rushing_ATT']   || 0,
              rushYd:  r['rushing_YDS']   || 0,
              rushTd:  (r['rushing_TD']   || 0) + (r['receiving_TD'] || 0),
              rec:     r['receiving_REC'] || 0,
              recYd:   r['receiving_YDS'] || 0,
            })),
          ];
        }
        break;
      }
      case 'WR': {
        // Strict: only players whose position in cached_players is 'WR'.
        const wrList = weekPlayers
          .filter(p => p['receiving_YDS'] != null && p['passing_YDS'] == null
                    && playerPos[normName(p.name)] === 'WR')
          .sort((a, b) => (b['receiving_YDS'] || 0) - (a['receiving_YDS'] || 0));
        if (wrList.length > 0) {
          players = [
            {
              rec:   wrList.reduce((s, p) => s + (p['receiving_REC'] || 0), 0),
              recYd: wrList.reduce((s, p) => s + (p['receiving_YDS'] || 0), 0),
              recTd: wrList.reduce((s, p) => s + (p['receiving_TD']  || 0), 0),
            },
            ...wrList.map(r => ({
              name:  r.name,
              rec:   r['receiving_REC'] || 0,
              recYd: r['receiving_YDS'] || 0,
              recTd: r['receiving_TD']  || 0,
            })),
          ];
        }
        break;
      }
      case 'TE': {
        // Strict: only players whose position in cached_players is 'TE'.
        const teList = weekPlayers
          .filter(p => p['receiving_YDS'] != null && p['passing_YDS'] == null
                    && playerPos[normName(p.name)] === 'TE')
          .sort((a, b) => (b['receiving_YDS'] || 0) - (a['receiving_YDS'] || 0));
        if (teList.length > 0) {
          players = [
            {
              rec:   teList.reduce((s, p) => s + (p['receiving_REC'] || 0), 0),
              recYd: teList.reduce((s, p) => s + (p['receiving_YDS'] || 0), 0),
              recTd: teList.reduce((s, p) => s + (p['receiving_TD']  || 0), 0),
            },
            ...teList.map(r => ({
              name:  r.name,
              rec:   r['receiving_REC'] || 0,
              recYd: r['receiving_YDS'] || 0,
              recTd: r['receiving_TD']  || 0,
            })),
          ];
        }
        break;
      }
      case 'DEF': {
        const ds = defStatsByWeek[week] ?? { sacks: 0, ints: 0, fumRec: 0, defTd: 0, safeties: 0 };
        players = [{ sacks: ds.sacks, ints: ds.ints, fumRec: ds.fumRec, defTd: ds.defTd, safeties: ds.safeties }];
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
    const defStats  = unitType === 'DEF' ? (defStatsByWeek[week] ?? null) : undefined;
    const roundHU = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
    const fptsVal = mult != null ? roundHU(pts * mult) : roundHU(pts)
    return {
      week,
      opponent,
      completed: true,
      isBye: false,
      fantasyPoints: fptsVal,   // NOW stores FPTS (WGTD×ODR) not raw WGTD
      wgtd: roundHU(pts),       // raw WGTD for reference
      fpts: fptsVal,
      rawPoints: roundHU(pts),
      multiplier: mult,
      odrMult: mult,
      players,
      defStats,
    };
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
  if (unit) return unit.projectedPoints / 4; // per-week
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
