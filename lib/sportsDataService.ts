/**
 * lib/sportsDataService.ts
 *
 * The ONLY file that calls the CFBD API directly.
 * Everything else in the app reads from Supabase via sportsDataReader.ts.
 *
 * Sync functions write to:
 *   cached_schedule, cached_scores, cached_players, cached_stats, cached_teams
 *
 * All operations are logged to data_refresh_log.
 */

import { createAdminClient } from '@/lib/supabase-server';

const BASE_URL = 'https://apinext.collegefootballdata.com';

// ── Scoring constants ─────────────────────────────────────────────────────────
const S = {
  passYd: 0.1, passTd: 4,  int: -2,
  rushYd: 0.1, rushTd: 6,  rec: 1.0,
  recYd:  0.1, recTd: 6,
  sack: 1, defInt: 2, fumRec: 2, defTd: 6,
};

// ── Unit role weights ─────────────────────────────────────────────────────────
const RB_WEIGHTS = [1.0, 0.5, 0.25] as const; // RB1×1.0 + RB2×0.5 + RB3×0.25; RB4+ excluded
const WR_WEIGHTS = [1.0, 0.5, 0.25] as const; // WR1×1.0 + WR2×0.5 + WR3×0.25; WR4+ excluded
const TE_WEIGHTS = [1.0, 0.5]       as const; // TE1×1.0 + TE2×0.5; TE3+ excluded

function rankMult(rank: number): number {
  if (rank <=   5) return 1.3;
  if (rank <=  10) return 1.2;
  if (rank <=  15) return 1.1;
  if (rank <=  25) return 1.0;
  if (rank <=  35) return 0.9;
  if (rank <=  50) return 0.8;
  if (rank <=  80) return 0.7;
  if (rank <= 100) return 0.6;
  return 0.5;
}

// ── CFBD fetch helper ─────────────────────────────────────────────────────────
async function cfbdGet(path: string, params: Record<string, string | number>): Promise<any[]> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) throw new Error('CFBD_API_KEY environment variable is not set');

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    next:    { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`CFBD ${path} → HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── Log helper ────────────────────────────────────────────────────────────────
async function logSync(
  jobName: string,
  status: 'success' | 'failed',
  recordsUpdated: number,
  errorMessage?: string,
) {
  const admin = createAdminClient();
  await admin.from('data_refresh_log').insert({
    job_name:        jobName,
    status,
    records_updated: recordsUpdated,
    error_message:   errorMessage ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// syncSchedule — fetch full-season schedule from CFBD, upsert cached_schedule
// ─────────────────────────────────────────────────────────────────────────────
export async function syncSchedule(season: number): Promise<number> {
  const admin = createAdminClient();
  let recordsUpdated = 0;

  try {
    const games = await cfbdGet('/games', { year: season });

    const rows = games
      .filter((g: any) => g.id && g.homeTeam && g.awayTeam && (g.seasonType === 'regular' || g.season_type === 'regular'))
      .map((g: any) => ({
        game_id:    String(g.id),
        week:       g.week ?? 0,
        season,
        home_team:  g.homeTeam,
        away_team:  g.awayTeam,
        game_date:  g.startDate ?? null,
        updated_at: new Date().toISOString(),
      }));

    if (rows.length > 0) {
      const { error } = await admin
        .from('cached_schedule')
        .upsert(rows, { onConflict: 'game_id' });
      if (error) throw error;
      recordsUpdated = rows.length;
    }

    await logSync(`syncSchedule:${season}`, 'success', recordsUpdated);
    return recordsUpdated;
  } catch (err: any) {
    await logSync(`syncSchedule:${season}`, 'failed', 0, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// syncScores — update cached_scores for games scheduled or in_progress
// ─────────────────────────────────────────────────────────────────────────────
export async function syncScores(week: number, season: number): Promise<number> {
  const admin = createAdminClient();
  let recordsUpdated = 0;

  try {
    const games = await cfbdGet('/games', { year: season, week });

    const rows = games
      .filter((g: any) => g.id && g.homeTeam && g.awayTeam && (g.seasonType === 'regular' || g.season_type === 'regular'))
      .map((g: any) => {
        const completed = g.homePoints != null && g.awayPoints != null;
        const inProgress = !completed && g.startDate && new Date(g.startDate) < new Date();
        return {
          game_id:    String(g.id),
          home_team:  g.homeTeam,
          away_team:  g.awayTeam,
          home_score: g.homePoints ?? null,
          away_score: g.awayPoints ?? null,
          week,
          season,
          status:     completed ? 'completed' : inProgress ? 'in_progress' : 'scheduled',
          start_time: g.startDate ?? null,
          updated_at: new Date().toISOString(),
        };
      });

    if (rows.length > 0) {
      const { error } = await admin
        .from('cached_scores')
        .upsert(rows, { onConflict: 'game_id' });
      if (error) throw error;
      recordsUpdated = rows.length;
    }

    await logSync(`syncScores:${season}:w${week}`, 'success', recordsUpdated);
    return recordsUpdated;
  } catch (err: any) {
    await logSync(`syncScores:${season}:w${week}`, 'failed', 0, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// syncRosters — fetch rosters for given teams, upsert cached_players
// ─────────────────────────────────────────────────────────────────────────────
// cfbdYear can differ from season when roster data is only available for a prior year.
export async function syncRosters(teams: string[], season: number = 2025, cfbdYear?: number): Promise<number> {
  const admin = createAdminClient();
  let recordsUpdated = 0;

  try {
    // Maps every known CFBD position string (uppercased) to our DB abbreviation.
    // Non-skill positions (OL, DL, LB, DB, P, LS, etc.) are intentionally absent
    // so they map to null and get filtered out before upsert.
    // CHECK constraint: position IN ('QB','RB','WR','TE','K','DEF')
    const cfbdPositionMap: Record<string, string> = {
      // QB
      QB: 'QB', QUARTERBACK: 'QB',
      // RB
      RB: 'RB', 'RUNNING BACK': 'RB', HB: 'RB', HALFBACK: 'RB',
      FB: 'RB', FULLBACK: 'RB',
      // WR
      WR: 'WR', 'WIDE RECEIVER': 'WR', 'WIDE RECEIVERS': 'WR',
      // TE
      TE: 'TE', 'TIGHT END': 'TE', 'TIGHT ENDS': 'TE',
      // K — all kicker variants CFBD uses
      K: 'K', PK: 'K', KICKER: 'K', 'PLACE KICKER': 'K',
      PLACEKICKER: 'K', 'PLACE-KICKER': 'K', KR: 'K',
    };

    // Position priority: higher number = takes precedence.
    // A player already stored as WR will NOT be downgraded to RB if both appear in CFBD data.
    const POSITION_PRIORITY: Record<string, number> = { QB: 5, WR: 4, TE: 4, RB: 2, K: 1, DEF: 0 };

    const rosterYear = cfbdYear ?? season;

    // Normalize year: CFBD returns integers (1=FR,2=SO,3=JR,4=SR,5=SR) OR
    // strings ('FR','SO','JR','SR','GR','RS','RS-FR',etc.).
    // cached_players.year CHECK: must be 'FR','SO','JR','SR' or NULL.
    const numToYear: Record<number, string> = { 1: 'FR', 2: 'SO', 3: 'JR', 4: 'SR', 5: 'SR' };
    const validYears = new Set(['FR', 'SO', 'JR', 'SR']);
    const normalizeYear = (raw: any): string | null => {
      if (raw == null) return null;
      if (typeof raw === 'number') return numToYear[raw] ?? null;
      const s = String(raw).trim().toUpperCase();
      if (validYears.has(s)) return s;
      const n = parseInt(s, 10);
      if (!isNaN(n)) return numToYear[n] ?? null;
      return null; // 'GR','RS','RS-FR','6','N/A' etc. → null (allowed by CHECK)
    };

    for (const team of teams) {
      try {
        const roster = await cfbdGet('/roster', { team, year: rosterYear });

        const rows = roster
          .filter((p: any) => p.firstName || p.lastName)
          .map((p: any) => {
            const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
            if (!name) return null;

            const posRaw: string = (p.position ?? '').toUpperCase().trim();
            const pos = cfbdPositionMap[posRaw] ?? null;
            if (!pos) return null; // non-skill position — skip silently

            const yr = normalizeYear(p.year);

            return {
              school:               team,
              season,
              position:             pos,              // CHECK: 'QB'|'RB'|'WR'|'TE'|'K'|'DEF'
              player_name:          name,
              jersey_number:        p.jersey != null ? String(p.jersey) : null,
              year:                 yr,               // CHECK: 'FR'|'SO'|'JR'|'SR'|null
              status:               'active' as const, // CHECK: 'active'|'injured'|'out'
              depth_chart_position: null,
              updated_at:           new Date().toISOString(),
            };
          })
          .filter(Boolean);

        if (rows.length === 0) continue;

        // ── Position priority guard ─────────────────────────────────────────
        // Fetch existing positions for this team so we never downgrade a player
        // from a higher-priority position (e.g. WR→RB when CFBD lists both).
        const { data: existingRows } = await admin
          .from('cached_players')
          .select('player_name, position')
          .eq('school', team)
          .eq('season', season)
          .in('player_name', rows.map((r: any) => r.player_name));

        const existingPosMap: Record<string, string> = {};
        for (const ep of existingRows ?? []) {
          if (ep.player_name) existingPosMap[ep.player_name] = ep.position;
        }

        const filteredRows = rows.filter((r: any) => {
          const existing = existingPosMap[r.player_name];
          if (!existing) return true; // new player — always insert
          const existPrio = POSITION_PRIORITY[existing] ?? 0;
          const newPrio   = POSITION_PRIORITY[r.position] ?? 0;
          return newPrio >= existPrio; // only update if same or higher priority
        });

        if (filteredRows.length === 0) continue;

        const { error } = await admin
          .from('cached_players')
          .upsert(filteredRows, { onConflict: 'school,player_name,season' });

        if (error) {
          console.error(
            `syncRosters:${team} upsert FAILED — code=${error.code} msg=${error.message}`,
            `details=${error.details ?? ''} hint=${error.hint ?? ''}`,
            `first_row=${JSON.stringify(filteredRows[0])}`,
          );
        } else {
          recordsUpdated += filteredRows.length;
        }
      } catch (teamErr: any) {
        console.error(`syncRosters:${team} fetch error:`, teamErr.message);
      }
    }

    await logSync(`syncRosters:${season}`, 'success', recordsUpdated);
    return recordsUpdated;
  } catch (err: any) {
    await logSync(`syncRosters:${season}`, 'failed', 0, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// syncStats — fetch completed-game stats, compute unit fantasy points, upsert
// ─────────────────────────────────────────────────────────────────────────────
export async function syncStats(week: number, season: number, schoolsFilter?: string[]): Promise<number> {
  const admin = createAdminClient();
  let recordsUpdated = 0;

  try {
    // Fetch all data in parallel
    const [games, playerStats, teamStats, eloData] = await Promise.all([
      cfbdGet('/games',         { year: season, week }),
      cfbdGet('/games/players', { year: season, week }).catch(() => []),
      cfbdGet('/games/teams',   { year: season, week }).catch(() => []),
      cfbdGet('/ratings/elo',   { year: season, week   }).catch(() => []),
    ]);

    // Build Elo rank map (rank 1 = strongest)
    const eloSorted = [...eloData].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    const eloRankMap: Record<string, number> = {};
    eloSorted.forEach((t, idx) => { if (t.team) eloRankMap[t.team] = idx + 1; });

    // Only process completed regular-season games (exclude bowls/postseason)
    const completedGames = (games as any[]).filter(
      (g: any) =>
        g.homePoints != null &&
        g.awayPoints != null &&
        (g.seasonType === 'regular' || g.season_type === 'regular'),
    );

    console.log(`[syncStats] week=${week} season=${season} totalGames=${(games as any[]).length} completedRegular=${completedGames.length}`);
    if (completedGames.length === 0) {
      await logSync(`syncStats:${season}:w${week}`, 'success', 0);
      return 0;
    }

    // Build team-stat map: school → { category: value }
    const teamStatMap: Record<string, Record<string, number>> = {};
    for (const game of teamStats as any[]) {
      for (const team of (game.teams ?? [])) {
        const school: string = team.school ?? team.team ?? '';
        if (!school) continue;
        if (!teamStatMap[school]) teamStatMap[school] = {};
        for (const s of (team.stats ?? [])) {
          teamStatMap[school][s.category] = parseFloat(s.stat) || 0;
        }
      }
    }

    // Build player-stat map: key = `gameId||school||playerName||category` → stats
    // game_id is included so per-game filtering is exact and never mixes stats
    // from different games played by the same school in the same week.
    const playerStatMap: Record<string, Record<string, any>> = {};
    for (const game of playerStats as any[]) {
      const gId = String(game.id ?? '');
      for (const team of (game.teams ?? [])) {
        const school: string = team.school ?? team.team ?? '';
        if (!school) continue;
        for (const cat of (team.categories ?? [])) {
          for (const type of (cat.types ?? [])) {
            for (const athlete of (type.athletes ?? [])) {
              const name: string = athlete.name ?? '';
              if (!name) continue;
              const key = `${gId}||${school}||${name}||${cat.name}`;
              if (!playerStatMap[key]) playerStatMap[key] = { gameId: gId, school, name, category: cat.name };
              playerStatMap[key][type.name] = (playerStatMap[key][type.name] || 0) + (parseFloat(athlete.stat) || 0);
            }
          }
        }
      }
    }

    // ── Fetch player positions for opportunity-based scoring ────────────────────
    const allSchoolsInBatch = Array.from(
      new Set<string>(completedGames.flatMap((g: any) => [g.homeTeam as string, g.awayTeam as string]))
    );
    const { data: posData } = await admin
      .from('cached_players')
      .select('school, player_name, position')
      .in('school', allSchoolsInBatch)
      .limit(10000);

    // Normalize player names for fuzzy matching: strip punctuation, lowercase, collapse spaces
    const normName = (n: string) =>
      n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

    const posMap:     Record<string, string> = {};  // exact:  school||player_name → position
    const posMapNorm: Record<string, string> = {};  // normalized: school||normName → position
    for (const p of (posData ?? [])) {
      if (p.school && p.player_name && p.position) {
        posMap[`${p.school}||${p.player_name}`] = p.position;
        posMapNorm[`${p.school}||${normName(p.player_name)}`] = p.position;
      }
    }

    const statRows: any[] = [];

    for (const game of completedGames) {
      const gameId = String(game.id);
      const teams  = [game.homeTeam, game.awayTeam];

      for (const school of teams) {
        if (schoolsFilter && !schoolsFilter.includes(school)) continue;
        const opponent = school === game.homeTeam ? game.awayTeam : game.homeTeam;
        const oppRank  = eloRankMap[opponent] ?? 999;
        const mult     = rankMult(oppRank);
        const ts       = teamStatMap[school] ?? {};

        // Filter to this specific game+school so stats from other games never bleed in
        const schoolEntries = Object.values(playerStatMap)
          .filter((e: any) => e.gameId === gameId && e.school === school);

        const addStatRow = (playerName: string | null, statType: string, value: number) => {
          statRows.push({
            game_id:     gameId,
            school,
            player_name: playerName,
            week,
            season,
            stat_type:   statType,
            value:       Math.round(value * 1000) / 1000,
            updated_at:  new Date().toISOString(),
          });
        };

        // ── Individual player stats ─────────────────────────────────────────
        for (const entry of schoolEntries) {
          const n = entry.name;
          const c = entry.category;

          if (c === 'passing') {
            addStatRow(n, 'passing_YDS', entry.YDS || 0);
            addStatRow(n, 'passing_TD',  entry.TD  || 0);
            addStatRow(n, 'passing_INT', entry.INT || 0);
          } else if (c === 'rushing') {
            addStatRow(n, 'rushing_YDS', entry.YDS || 0);
            addStatRow(n, 'rushing_TD',  entry.TD  || 0);
            addStatRow(n, 'rushing_ATT', entry.ATT || 0);
          } else if (c === 'receiving') {
            addStatRow(n, 'receiving_YDS', entry.YDS || 0);
            addStatRow(n, 'receiving_TD',  entry.TD  || 0);
            addStatRow(n, 'receiving_REC', entry.REC || 0);
          } else if (c === 'kicking') {
            addStatRow(n, 'kicking_PTS', entry.PTS || 0);
          }
        }

        // ── Team-level stats ────────────────────────────────────────────────
        const teamCats = [
          'rushingYards','rushingTDs','sacks','passesIntercepted',
          'fumblesRecovered','interceptionTDs','fumbleReturnTDs',
        ];
        for (const cat of teamCats) {
          addStatRow(null, `team_${cat}`, ts[cat] || 0);
        }

        // ── Store the multiplier used so game logs can display it accurately ──
        addStatRow(null, 'game_mult', mult);

        // ── Compute unit fantasy points (Elo-adjusted) ──────────────────────
        console.log(`[unit-scoring-start] ${school} wk${week} starting unit calculations (entries=${schoolEntries.length})`);

        // Individual scoring helpers
        const calcRecvPts = (e: any) =>
          (e.YDS || 0) * S.recYd + (e.REC || 0) * S.rec + (e.TD || 0) * S.recTd;
        const calcRushPts = (e: any) =>
          (e.YDS || 0) * S.rushYd + (e.TD || 0) * S.rushTd;

        // ── STEP 0: Pre-assign every player to exactly ONE unit ────────────
        // This is the single source of truth for all scoring below.
        // No player can contribute to more than one unit in a game.
        type UnitLabel = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'EXCLUDED';
        const UNIT_CODE: Record<UnitLabel, number> = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, EXCLUDED: 0 };

        const unitAssignments = new Map<string, UnitLabel>();

        // Collect all distinct player names appearing in game stats
        const allPlayerNames = Array.from(new Set<string>(
          schoolEntries.map((e: any) => e.name as string).filter(Boolean)
        ));

        for (const name of allPlayerNames) {
          // Try exact match first, then normalized fallback to handle punctuation differences
          // e.g. "T.J. Logan" (CFBD stats) vs "TJ Logan" (cached_players)
          const cachedPos = (
            posMap[`${school}||${name}`] ??
            posMapNorm[`${school}||${normName(name)}`]
          ) as UnitLabel | undefined;
          const hasPass   = schoolEntries.some((e: any) => e.name === name && e.category === 'passing');
          const hasRush   = schoolEntries.some((e: any) => e.name === name && e.category === 'rushing');
          const hasRecv   = schoolEntries.some((e: any) => e.name === name && e.category === 'receiving');
          const hasKick   = schoolEntries.some((e: any) => e.name === name && e.category === 'kicking');

          // ── Step 1: cached_players is ALWAYS the source of truth ──────────
          // If the player exists in cached_players, use that position. Done.
          // No stat-based logic can override a DB-registered position.
          if (cachedPos === 'QB' || cachedPos === 'WR' || cachedPos === 'TE' ||
              cachedPos === 'RB' || cachedPos === 'K') {
            unitAssignments.set(name, cachedPos);
            continue;
          }

          // ── Step 2: stats-only inference (NOT in cached_players) ──────────
          // Has passing attempts → QB
          if (hasPass) {
            unitAssignments.set(name, 'QB');
            continue;
          }
          // Kicking only → K
          if (hasKick && !hasRush && !hasRecv) {
            unitAssignments.set(name, 'K');
            continue;
          }
          // Rush only → RB
          if (hasRush && !hasRecv) {
            unitAssignments.set(name, 'RB');
            continue;
          }
          // Recv only → WR (can't distinguish TE without position data)
          if (hasRecv && !hasRush) {
            unitAssignments.set(name, 'WR');
            continue;
          }
          // Rush + recv → compare contributions; higher-scoring unit wins
          if (hasRush && hasRecv) {
            const rushE = schoolEntries.find((e: any) => e.name === name && e.category === 'rushing') ?? {};
            const recvE = schoolEntries.find((e: any) => e.name === name && e.category === 'receiving') ?? {};
            const rushOnlyPts = calcRushPts(rushE);
            const recvOnlyPts = calcRecvPts(recvE);
            const assigned: UnitLabel = rushOnlyPts > recvOnlyPts ? 'RB' : 'WR';
            console.log(
              `[unit-assignment] ${name} (${school}) week ${week}: conflict` +
              ` RB(${rushOnlyPts.toFixed(1)}pts) vs WR(${recvOnlyPts.toFixed(1)}pts)` +
              ` cached=none → assigned to ${assigned}`
            );
            unitAssignments.set(name, assigned);
            continue;
          }

          unitAssignments.set(name, 'EXCLUDED');
        }

        // Diagnostic log: show unit assignment counts + TE player names
        const assignCounts: Record<string, number> = {};
        const teAssigned: string[] = [];
        for (const [n, lbl] of Array.from(unitAssignments.entries())) {
          assignCounts[lbl] = (assignCounts[lbl] ?? 0) + 1;
          if (lbl === 'TE') teAssigned.push(n);
        }
        console.log(
          `[unit-assignment] ${school} wk${week}: ` +
          Object.entries(assignCounts).map(([l, c]) => `${l}=${c}`).join(' ') +
          ` | TE players: [${teAssigned.join(', ') || 'NONE'}]`
        );

        // Store assignments in cached_stats for auditing
        for (const [name, label] of Array.from(unitAssignments.entries())) {
          if (label !== 'EXCLUDED') {
            addStatRow(name, 'player_unit_assignment', UNIT_CODE[label]);
          }
        }

        // Helper: get entries filtered to a specific unit assignment
        const entriesFor = (unit: UnitLabel, category: string) =>
          schoolEntries.filter((e: any) =>
            e.category === category && unitAssignments.get(e.name as string) === unit
          );

        // ── QB ─────────────────────────────────────────────────────────────
        const passers = entriesFor('QB', 'passing')
          .sort((a: any, b: any) => {
            const pA = (a.YDS||0)*S.passYd + (a.TD||0)*S.passTd + (a.INT||0)*S.int;
            const pB = (b.YDS||0)*S.passYd + (b.TD||0)*S.passTd + (b.INT||0)*S.int;
            return pB - pA;
          });
        const topQB = passers[0];
        if (topQB) {
          const qbRushEntry = entriesFor('QB', 'rushing').find((e: any) => e.name === topQB.name);
          const rawQB = (topQB.YDS||0)*S.passYd + (topQB.TD||0)*S.passTd + (topQB.INT||0)*S.int
            + calcRushPts(qbRushEntry ?? {});
          addStatRow(null, 'unit_QB', Math.round(rawQB * mult * 10) / 10);
        } else {
          addStatRow(null, 'unit_QB', 0);
        }

        // ── RB ─────────────────────────────────────────────────────────────
        // Rank by raw fantasy points descending; RB4+ excluded (weight = 0).
        const rbRushers   = entriesFor('RB', 'rushing');
        const rbReceivers = entriesFor('RB', 'receiving');

        const rbPlayerNames = new Set<string>([
          ...rbRushers.map((e: any) => e.name as string),
          ...rbReceivers.map((e: any) => e.name as string),
        ]);

        const rbPlayerData = Array.from(rbPlayerNames).map(name => {
          const r  = rbRushers.find((e: any) => e.name === name)   ?? {};
          const cv = rbReceivers.find((e: any) => e.name === name) ?? {};
          const touches = (r.ATT || 0) + (cv.REC || 0);
          return { name, rushATT: r.ATT || 0, rec: cv.REC || 0, touches, pts: calcRushPts(r) + calcRecvPts(cv) };
        });
        const totalRBTouches = rbPlayerData.reduce((s, p) => s + p.touches, 0);

        // Sort by raw pts descending (tie-break: more touches wins)
        const rankedRBs = rbPlayerData.sort((a, b) => b.pts - a.pts || b.touches - a.touches);

        let rbUnitRaw = 0;
        for (let ri = 0; ri < Math.min(rankedRBs.length, RB_WEIGHTS.length); ri++) {
          const rb = rankedRBs[ri];
          const w  = rb.pts * RB_WEIGHTS[ri];
          rbUnitRaw += w;
          // Opportunity score kept for display only (not used for ranking)
          const oppShare = totalRBTouches > 0 ? rb.touches / totalRBTouches : 0;
          addStatRow(rb.name, `rb${ri+1}_opportunity`, Math.round(oppShare * 1000) / 1000);
          addStatRow(rb.name, `rb${ri+1}_rank_pts`,    Math.round(w * 100) / 100);
        }
        addStatRow(null, 'unit_RB', Math.round(rbUnitRaw * mult * 10) / 10);

        // ── WR / TE — split ALL receivers directly via posMap (bypasses unitAssignments) ──
        // unitAssignments can misclassify TEs as WR when posMap lookup fails due to
        // name mismatch (e.g. "T.J. Hockenson" vs "TJ Hockenson"). Instead we query
        // posMap/posMapNorm directly on every receiving entry so TEs are never lost.
        const allSchoolReceivers = schoolEntries.filter((e: any) => e.category === 'receiving');

        const wrEntries = allSchoolReceivers.filter((e: any) => {
          const pos = posMap[`${school}||${e.name}`] ?? posMapNorm[`${school}||${normName(e.name)}`];
          // TE goes to TE bucket; RB/QB receivers stay out; everything else is WR
          return pos !== 'TE' && pos !== 'RB' && pos !== 'QB' && pos !== 'K';
        });

        const teEntries = allSchoolReceivers.filter((e: any) => {
          const pos = posMap[`${school}||${e.name}`] ?? posMapNorm[`${school}||${normName(e.name)}`];
          return pos === 'TE';
        });

        console.log(`[WR-debug] ${school} wk${week}: ${wrEntries.length} WR receivers`);
        console.log(`[TE-debug] ${school} wk${week}: ${teEntries.length} TE entries: [${teEntries.map((e: any) => e.name).join(', ') || 'NONE'}]`);

        // ── WR ────────────────────────────────────────────────────────────
        // Rank by raw fantasy points descending; WR4+ excluded (weight = 0).
        // Opportunity share kept for display only (not used for ranking).
        const totalWRRec  = wrEntries.reduce((s: number, e: any) => s + (e.REC || 0), 0);
        const rankedWRs   = wrEntries
          .map((e: any) => ({ name: e.name as string, pts: calcRecvPts(e), rec: e.REC || 0 }))
          .sort((a, b) => b.pts - a.pts || b.rec - a.rec);

        let wrUnitRaw = 0;
        for (let wi = 0; wi < Math.min(rankedWRs.length, WR_WEIGHTS.length); wi++) {
          const wr = rankedWRs[wi];
          const w  = wr.pts * WR_WEIGHTS[wi];
          wrUnitRaw += w;
          const oppShare = totalWRRec > 0 ? wr.rec / totalWRRec : 0;
          addStatRow(wr.name, `wr${wi+1}_opportunity`, Math.round(oppShare * 1000) / 1000);
          addStatRow(wr.name, `wr${wi+1}_rank_pts`,    Math.round(w * 100) / 100);
        }
        addStatRow(null, 'unit_WR', Math.round(wrUnitRaw * mult * 10) / 10);

        // ── TE ────────────────────────────────────────────────────────────
        const tePlayers = teEntries
          .map((e: any) => ({ ...e, pts: calcRecvPts(e) }))
          .sort((a: any, b: any) => b.pts - a.pts);

        const te1 = tePlayers[0];
        const te2 = tePlayers[1];
        const te1pts = te1 ? te1.pts : 0;
        const te2pts = te2 ? te2.pts : 0;
        const teUnitRaw = (te1pts * TE_WEIGHTS[0]) + (te2pts * (TE_WEIGHTS[1] ?? 0));

        console.log(
          `[TE-debug] ${school} wk${week}: TE1=${te1?.name ?? 'none'}(${te1pts.toFixed(1)}pts)` +
          ` TE2=${te2?.name ?? 'none'}(${te2pts.toFixed(1)}pts)` +
          ` unit=${(teUnitRaw * mult).toFixed(1)} mult=${mult.toFixed(2)}`
        );

        const totalTERec = tePlayers.reduce((s: number, e: any) => s + (e.REC || 0), 0);
        if (te1) {
          const te1Share = totalTERec > 0 ? (te1.REC || 0) / totalTERec : 0;
          addStatRow(te1.name, 'te1_opportunity', Math.round(te1Share * 1000) / 1000);
          addStatRow(te1.name, 'te1_rank_pts',    Math.round(te1pts * TE_WEIGHTS[0] * 100) / 100);
        }
        if (te2) {
          const te2Share = totalTERec > 0 ? (te2.REC || 0) / totalTERec : 0;
          addStatRow(te2.name, 'te2_opportunity', Math.round(te2Share * 1000) / 1000);
          addStatRow(te2.name, 'te2_rank_pts',    Math.round(te2pts * (TE_WEIGHTS[1] ?? 0) * 100) / 100);
        }

        addStatRow(null, 'unit_TE', Math.round(teUnitRaw * mult * 10) / 10);

        // ── DEF ───────────────────────────────────────────────────────────
        const rawDEF = (ts.sacks             || 0) * S.sack   +
                       (ts.passesIntercepted || 0) * S.defInt +
                       (ts.fumblesRecovered  || 0) * S.fumRec +
                       ((ts.interceptionTDs  || 0) + (ts.fumbleReturnTDs || 0)) * S.defTd;
        addStatRow(null, 'unit_DEF', Math.round(rawDEF * mult * 10) / 10);

        // ── K ─────────────────────────────────────────────────────────────
        const kicker = entriesFor('K', 'kicking')
          .sort((a: any, b: any) => (b.PTS || 0) - (a.PTS || 0))[0];
        addStatRow(null, 'unit_K', kicker ? Math.round((kicker.PTS || 0) * mult * 10) / 10 : 0);
      }
    }

    // ── Persist to cached_stats ────────────────────────────────────────────────
    // Three categories:
    //   unitRows   — player_name IS NULL (unit_QB, unit_RB, game_mult, team_*): delete + insert
    //   roleRows   — player_name NOT NULL, role stat type (rb1_opportunity etc.): delete + insert
    //   playerRows — player_name NOT NULL, raw stats (passing_YDS etc.): upsert
    const ROLE_TYPES = new Set([
      'rb1_opportunity','rb2_opportunity','rb3_opportunity',
      'wr1_opportunity','wr2_opportunity','wr3_opportunity',
      'te1_opportunity','te2_opportunity',
      'rb1_rank_pts','rb2_rank_pts','rb3_rank_pts',
      'wr1_rank_pts','wr2_rank_pts','wr3_rank_pts',
      'te1_rank_pts','te2_rank_pts',
      'player_unit_assignment',
    ]);

    const playerRows = statRows.filter(r => r.player_name !== null && !ROLE_TYPES.has(r.stat_type));
    const roleRows   = statRows.filter(r => r.player_name !== null &&  ROLE_TYPES.has(r.stat_type));
    const unitRows   = statRows.filter(r => r.player_name === null);

    const gameIds = Array.from(new Set(completedGames.map((g: any) => String(g.id))));
    const schools = Array.from(new Set(completedGames.flatMap((g: any) => [g.homeTeam, g.awayTeam])));

    if (gameIds.length > 0) {
      // Delete unit rows (player_name IS NULL) — re-inserted fresh each sync
      const { error: delErr } = await admin
        .from('cached_stats')
        .delete()
        .in('game_id', gameIds)
        .is('player_name', null);
      if (delErr) throw delErr;

      // Delete role rows (opportunity/rank_pts) — re-inserted so rankings can change
      if (roleRows.length > 0) {
        await admin
          .from('cached_stats')
          .delete()
          .in('game_id', gameIds)
          .in('stat_type', Array.from(ROLE_TYPES));
      }

      // Delete any legacy player rows with game_id=NULL for these school+week+season combos.
      if (schools.length > 0) {
        const { error: delNullErr } = await admin
          .from('cached_stats')
          .delete()
          .in('school', schools)
          .eq('week', week)
          .eq('season', season)
          .is('game_id', null)
          .not('player_name', 'is', null);
        if (delNullErr) console.warn('[syncStats] Failed to delete legacy null-game_id rows:', delNullErr.message);
      }
    }

    const BATCH = 500;
    for (let i = 0; i < playerRows.length; i += BATCH) {
      const batch = playerRows.slice(i, i + BATCH);
      const { error } = await admin
        .from('cached_stats')
        .upsert(batch, { onConflict: 'game_id,school,player_name,stat_type' });
      if (error) throw error;
      recordsUpdated += batch.length;
    }
    for (const rows of [roleRows, unitRows]) {
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await admin
          .from('cached_stats')
          .insert(batch);
        if (error) throw error;
        recordsUpdated += batch.length;
      }
    }

    await logSync(`syncStats:${season}:w${week}`, 'success', recordsUpdated);
    return recordsUpdated;
  } catch (err: any) {
    await logSync(`syncStats:${season}:w${week}`, 'failed', 0, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getActiveGames — returns games currently in_progress from cached_scores
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveGames(): Promise<any[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cached_scores')
    .select('*')
    .eq('status', 'in_progress')
    .order('start_time');
  return data ?? [];
}
