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

// ── Scoring constants (mirrors unit-stats/route.ts exactly) ──────────────────
const S = {
  passYd: 0.05, passTd: 4, int: -2,
  rushYd: 0.05, rushTd: 6,
  recYd:  0.05, recTd: 6,
  sack: 1, defInt: 2, fumRec: 2, defTd: 6,
};

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
export async function syncRosters(teams: string[], season: number = 2025): Promise<number> {
  const admin = createAdminClient();
  let recordsUpdated = 0;

  try {
    const cfbdPositionMap: Record<string, string> = {
      QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K',
      PK: 'K', KR: 'K',
    };

    for (const team of teams) {
      try {
        const roster = await cfbdGet('/roster', { team, year: season });

        const rows = roster
          .filter((p: any) => p.firstName || p.lastName)
          .map((p: any) => {
            const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
            const posRaw: string = (p.position ?? '').toUpperCase();
            const pos = cfbdPositionMap[posRaw] ?? null;
            if (!pos) return null;

            return {
              school:               team,
              position:             pos,
              player_name:          name,
              jersey_number:        p.jersey != null ? String(p.jersey) : null,
              year:                 p.year   != null ? p.year            : null,
              status:               'active',
              depth_chart_position: null,
              updated_at:           new Date().toISOString(),
            };
          })
          .filter(Boolean);

        if (rows.length > 0) {
          const { error } = await admin
            .from('cached_players')
            .upsert(rows, { onConflict: 'school,position,player_name' });
          if (error) {
            console.error(`syncRosters:${team} upsert error:`, error.message);
          } else {
            recordsUpdated += rows.length;
          }
        }
      } catch (teamErr: any) {
        console.error(`syncRosters:${team} error:`, teamErr.message);
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
export async function syncStats(week: number, season: number): Promise<number> {
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

    // Build player-stat map: key = `school||playerName||category` → stats
    const playerStatMap: Record<string, Record<string, any>> = {};
    for (const game of playerStats as any[]) {
      for (const team of (game.teams ?? [])) {
        const school: string = team.school ?? team.team ?? '';
        if (!school) continue;
        for (const cat of (team.categories ?? [])) {
          for (const type of (cat.types ?? [])) {
            for (const athlete of (type.athletes ?? [])) {
              const name: string = athlete.name ?? '';
              const key = `${school}||${name}||${cat.name}`;
              if (!playerStatMap[key]) playerStatMap[key] = { school, name, category: cat.name };
              playerStatMap[key][type.name] = (playerStatMap[key][type.name] || 0) + (parseFloat(athlete.stat) || 0);
            }
          }
        }
      }
    }

    const statRows: any[] = [];

    for (const game of completedGames) {
      const gameId = String(game.id);
      const teams  = [game.homeTeam, game.awayTeam];

      for (const school of teams) {
        const opponent = school === game.homeTeam ? game.awayTeam : game.homeTeam;
        const oppRank  = eloRankMap[opponent] ?? 999;
        const mult     = rankMult(oppRank);
        const ts       = teamStatMap[school] ?? {};

        const schoolEntries = Object.values(playerStatMap)
          .filter((e: any) => e.school === school);

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

        // QB
        const passers = schoolEntries.filter(e => e.category === 'passing')
          .sort((a, b) => (b.YDS || 0) - (a.YDS || 0));
        const qb = passers[0];
        if (qb) {
          const qbRush  = playerStatMap[`${school}||${qb.name}||rushing`] ?? {};
          const rawQB   = (qb.YDS  || 0) * S.passYd +
                          (qb.TD   || 0) * S.passTd +
                          (qb.INT  || 0) * S.int    +
                          (qbRush.YDS || 0) * S.rushYd +
                          (qbRush.TD  || 0) * S.rushTd;
          addStatRow(null, 'unit_QB', Math.round(rawQB * mult * 10) / 10);
        } else {
          addStatRow(null, 'unit_QB', 0);
        }

        // RB (team rushing)
        const rawRB = (ts.rushingYards || 0) * S.rushYd + (ts.rushingTDs || 0) * S.rushTd;
        addStatRow(null, 'unit_RB', Math.round(rawRB * mult * 10) / 10);

        // WR / TE (top-5 receivers excl. QBs, same score for both)
        const recvs = schoolEntries
          .filter(e => e.category === 'receiving')
          .filter(e => !schoolEntries.some(p => p.name === e.name && p.category === 'passing'))
          .sort((a, b) => (b.YDS || 0) - (a.YDS || 0))
          .slice(0, 5);
        const rawRecv = recvs.reduce(
          (s, r) => s + (r.YDS || 0) * S.recYd + (r.TD || 0) * S.recTd, 0,
        );
        addStatRow(null, 'unit_WR', Math.round(rawRecv * mult * 10) / 10);
        addStatRow(null, 'unit_TE', Math.round(rawRecv * mult * 10) / 10);

        // DEF
        const rawDEF = (ts.sacks             || 0) * S.sack   +
                       (ts.passesIntercepted || 0) * S.defInt +
                       (ts.fumblesRecovered  || 0) * S.fumRec +
                       ((ts.interceptionTDs  || 0) + (ts.fumbleReturnTDs || 0)) * S.defTd;
        addStatRow(null, 'unit_DEF', Math.round(rawDEF * mult * 10) / 10);

        // K
        const kicker = schoolEntries
          .filter(e => e.category === 'kicking')
          .sort((a, b) => (b.PTS || 0) - (a.PTS || 0))[0];
        addStatRow(null, 'unit_K', kicker ? Math.round((kicker.PTS || 0) * mult * 10) / 10 : 0);
      }
    }

    // Split into player rows (player_name NOT NULL) and unit/team rows (player_name IS NULL).
    // Player rows can be safely upserted — the unique key (game_id, school, player_name, stat_type)
    // works correctly because player_name is never NULL.
    // Unit/team rows (unit_QB, unit_RB, game_mult, team_*) have player_name=NULL.
    // PostgreSQL UNIQUE treats NULL≠NULL, so upsert would INSERT duplicates every run.
    // Fix: DELETE existing NULL-player rows for these game_ids, then INSERT fresh.
    const playerRows = statRows.filter(r => r.player_name !== null);
    const unitRows   = statRows.filter(r => r.player_name === null);

    const gameIds = [...new Set(completedGames.map((g: any) => String(g.id)))];
    if (gameIds.length > 0) {
      const { error: delErr } = await admin
        .from('cached_stats')
        .delete()
        .in('game_id', gameIds)
        .is('player_name', null);
      if (delErr) throw delErr;
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
    for (let i = 0; i < unitRows.length; i += BATCH) {
      const batch = unitRows.slice(i, i + BATCH);
      const { error } = await admin
        .from('cached_stats')
        .insert(batch);
      if (error) throw error;
      recordsUpdated += batch.length;
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
