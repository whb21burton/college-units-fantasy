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
      TE: 'TE', 'TIGHT END': 'TE', 'TIGHT ENDS': 'TE', 'T.E.': 'TE', 'TE ': 'TE',
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

        // ── Debug: log all raw position strings from CFBD ───────────────────
        const rawPositions = Array.from(new Set(roster.map((p: any) => p.position ?? 'NULL')));
        console.log(`[syncRosters] ${team} raw positions from CFBD: ${rawPositions.join(', ')}`);

        const posCounts: Record<string, number> = {};
        for (const p of roster) {
          const raw = (p.position ?? 'NONE').toUpperCase().trim();
          const mapped = cfbdPositionMap[raw] ?? `UNMAPPED(${raw})`;
          posCounts[mapped] = (posCounts[mapped] ?? 0) + 1;
        }
        console.log(`[syncRosters] ${team} position mapping: ${JSON.stringify(posCounts)}`);

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
    // ── Fetch all data in parallel ──────────────────────────────────────────
    const [games, playerStats, teamStats, eloData] = await Promise.all([
      cfbdGet('/games',         { year: season, week }),
      cfbdGet('/games/players', { year: season, week }).catch(() => []),
      cfbdGet('/games/teams',   { year: season, week }).catch(() => []),
      cfbdGet('/ratings/elo',   { year: season, week }).catch(() => []),
    ]);

    // ── Only completed regular-season games ────────────────────────────────
    const completedGames = (games as any[]).filter(
      (g: any) =>
        g.homePoints != null &&
        g.awayPoints != null &&
        (g.seasonType === 'regular' || g.season_type === 'regular'),
    );

    if (completedGames.length === 0) {
      await logSync(`syncStats:${season}:w${week}`, 'success', 0);
      return 0;
    }

    // ── Elo rank map (rank 1 = strongest) ──────────────────────────────────
    const eloSorted = [...(eloData as any[])].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    const eloRankMap: Record<string, number> = {};
    eloSorted.forEach((t, idx) => { if (t.team) eloRankMap[t.team] = idx + 1; });

    // ── Team stat map: school → { statCategory: value } ────────────────────
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

    // ── Player stat map: gameId||school||name||category → stat fields ───────
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

    // ── STEP 1: Load positions for all schools in this week's games ─────────
    const allSchools = Array.from(
      new Set<string>(completedGames.flatMap((g: any) => [g.homeTeam as string, g.awayTeam as string]))
    );
    const { data: posData } = await admin
      .from('cached_players')
      .select('school, player_name, position')
      .in('school', allSchools)
      .limit(10000);

    // Build posLookup with exact AND space-normalized keys so name mismatches
    // (e.g. "T.J. Hockenson" CFBD vs "TJ Hockenson" roster) are still found.
    const normPlayerName = (n: string) =>
      n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

    const posLookup: Record<string, string> = {};
    for (const p of posData ?? []) {
      if (p.school && p.player_name && p.position) {
        posLookup[`${p.school}||${p.player_name}`] = p.position;                      // exact
        posLookup[`${p.school}||${normPlayerName(p.player_name)}`] = p.position;      // normalized
      }
    }

    const getPosition = (school: string, name: string): string | null => {
      // Try 1: exact match
      let pos = posLookup[`${school}||${name}`];
      if (pos) return pos;

      // Try 2: normalized (strip punctuation, lowercase, keep spaces)
      const norm = normPlayerName(name);
      pos = posLookup[`${school}||${norm}`];
      if (pos) return pos;

      // Try 3: last-name-only match — TE only (avoids false positives for common names)
      const lastName = norm.split(' ').pop() ?? '';
      if (lastName.length > 3) {
        const lastNameKey = Object.keys(posLookup).find(k =>
          k.startsWith(`${school}||`) && k.endsWith(lastName) && posLookup[k] === 'TE'
        );
        if (lastNameKey) return 'TE';
      }

      return null;
    }

    // ── Process each completed game ─────────────────────────────────────────
    for (const game of completedGames) {
      const gameId = String(game.id);

      for (const school of [game.homeTeam, game.awayTeam] as string[]) {
        if (schoolsFilter && !schoolsFilter.includes(school)) continue;

        const opponent = school === game.homeTeam ? game.awayTeam : game.homeTeam;
        const mult     = rankMult(eloRankMap[opponent] ?? 999);
        const ts       = teamStatMap[school] ?? {};

        const schoolEntries = Object.values(playerStatMap)
          .filter((e: any) => e.gameId === gameId && e.school === school);

        const rows: any[] = [];
        const addRow = (playerName: string | null, statType: string, value: number) => {
          rows.push({
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

        // ── STEP 2+3: Per-player stats + unit assignment ──────────────────
        type UnitKey = 'QB' | 'RB' | 'WR' | 'TE' | 'K';
        const unitPlayers: Record<UnitKey, Array<{ name: string; pts: number }>> = {
          QB: [], RB: [], WR: [], TE: [], K: [],
        };

        const playerNames = Array.from(new Set<string>(
          schoolEntries.map((e: any) => e.name as string).filter(Boolean)
        ));

        for (const name of playerNames) {
          const passE = schoolEntries.find((e: any) => e.name === name && e.category === 'passing');
          const rushE = schoolEntries.find((e: any) => e.name === name && e.category === 'rushing');
          const recvE = schoolEntries.find((e: any) => e.name === name && e.category === 'receiving');
          const kickE = schoolEntries.find((e: any) => e.name === name && e.category === 'kicking');

          // Store individual player stats
          if (passE) {
            addRow(name, 'passing_YDS', passE.YDS || 0);
            addRow(name, 'passing_TD',  passE.TD  || 0);
            addRow(name, 'passing_INT', passE.INT || 0);
          }
          if (rushE) {
            addRow(name, 'rushing_YDS', rushE.YDS || 0);
            addRow(name, 'rushing_TD',  rushE.TD  || 0);
            addRow(name, 'rushing_ATT', rushE.ATT || 0);
          }
          if (recvE) {
            addRow(name, 'receiving_YDS', recvE.YDS || 0);
            addRow(name, 'receiving_TD',  recvE.TD  || 0);
            addRow(name, 'receiving_REC', recvE.REC || 0);
          }
          if (kickE) {
            addRow(name, 'kicking_PTS', kickE.PTS || 0);
          }

          // ── Assign to unit: posLookup first, then stats inference ─────
          const pos = getPosition(school, name);
          let unit: UnitKey | null = null;

          if (pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE' || pos === 'K') {
            unit = pos;
          } else if (passE) {
            unit = 'QB';
          } else if (kickE && !rushE && !recvE) {
            unit = 'K';
          } else if (rushE && !recvE) {
            unit = 'RB';
          } else if (recvE && !rushE) {
            unit = 'WR';
          } else if (rushE && recvE) {
            const rushPts = (rushE.YDS || 0) * S.rushYd + (rushE.TD || 0) * S.rushTd;
            const recvPts = (recvE.YDS || 0) * S.recYd  + (recvE.REC || 0) * S.rec + (recvE.TD || 0) * S.recTd;
            unit = rushPts >= recvPts ? 'RB' : 'WR';
          }

          if (!unit) continue;

          // ── STEP 4: Calculate raw fantasy points ──────────────────────
          let pts = 0;
          if (unit === 'QB') {
            pts = (passE ? (passE.YDS||0)*S.passYd + (passE.TD||0)*S.passTd + (passE.INT||0)*S.int : 0)
                + (rushE ? (rushE.YDS||0)*S.rushYd  + (rushE.TD||0)*S.rushTd : 0);
          } else if (unit === 'RB') {
            pts = (rushE ? (rushE.YDS||0)*S.rushYd + (rushE.TD||0)*S.rushTd : 0)
                + (recvE ? (recvE.YDS||0)*S.recYd  + (recvE.REC||0)*S.rec + (recvE.TD||0)*S.recTd : 0);
          } else if (unit === 'WR' || unit === 'TE') {
            pts = recvE ? (recvE.YDS||0)*S.recYd + (recvE.REC||0)*S.rec + (recvE.TD||0)*S.recTd : 0;
          } else if (unit === 'K') {
            pts = kickE ? (kickE.PTS || 0) : 0;
          }

          unitPlayers[unit].push({ name, pts });
        }

        // ── STEP 5+6: Rank within unit, apply weights × ODR mult ──────────
        addRow(null, 'game_mult', mult);

        // QB: top scorer only (no weight multiplier)
        unitPlayers.QB.sort((a, b) => b.pts - a.pts);
        const topQB = unitPlayers.QB[0];
        addRow(null, 'unit_QB', topQB ? Math.round(topQB.pts * mult * 10) / 10 : 0);

        // RB
        unitPlayers.RB.sort((a, b) => b.pts - a.pts);
        let rbRaw = 0;
        for (let i = 0; i < Math.min(unitPlayers.RB.length, RB_WEIGHTS.length); i++) {
          rbRaw += unitPlayers.RB[i].pts * RB_WEIGHTS[i];
        }
        addRow(null, 'unit_RB', Math.round(rbRaw * mult * 10) / 10);

        // WR
        unitPlayers.WR.sort((a, b) => b.pts - a.pts);
        let wrRaw = 0;
        for (let i = 0; i < Math.min(unitPlayers.WR.length, WR_WEIGHTS.length); i++) {
          wrRaw += unitPlayers.WR[i].pts * WR_WEIGHTS[i];
        }
        addRow(null, 'unit_WR', Math.round(wrRaw * mult * 10) / 10);

        // TE
        unitPlayers.TE.sort((a, b) => b.pts - a.pts);
        let teRaw = 0;
        for (let i = 0; i < Math.min(unitPlayers.TE.length, TE_WEIGHTS.length); i++) {
          teRaw += unitPlayers.TE[i].pts * TE_WEIGHTS[i];
        }
        addRow(null, 'unit_TE', Math.round(teRaw * mult * 10) / 10);
        console.log(`[TE] ${school} wk${week}: ${unitPlayers.TE.length} TEs found, score=${teRaw.toFixed(1)}`);

        // DEF
        const rawDEF =
          (ts.sacks             || 0) * S.sack   +
          (ts.passesIntercepted || 0) * S.defInt +
          (ts.fumblesRecovered  || 0) * S.fumRec +
          ((ts.interceptionTDs  || 0) + (ts.fumbleReturnTDs || 0)) * S.defTd;
        addRow(null, 'unit_DEF', Math.round(rawDEF * mult * 10) / 10);

        // K: top kicker's PTS field directly
        unitPlayers.K.sort((a, b) => b.pts - a.pts);
        const topK = unitPlayers.K[0];
        addRow(null, 'unit_K', topK ? Math.round(topK.pts * mult * 10) / 10 : 0);

        // ── STEP 7: Persist per school ──────────────────────────────────────
        await admin.from('cached_stats').delete()
          .eq('game_id', gameId).eq('school', school);

        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const { error } = await admin.from('cached_stats').insert(rows.slice(i, i + BATCH));
          if (error) throw error;
        }
        recordsUpdated += rows.length;
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
