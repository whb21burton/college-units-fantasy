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
import { odrLabelFromMult } from '@/lib/odr';
import type { UnitType } from '@/lib/playerPool';

export const dynamic = 'force-dynamic';

const RB_W = [1.0, 0.5, 0.25];
const WR_W = [1.0, 0.5, 0.25];
const TE_W = [1.0, 0.5];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const school    = searchParams.get('school')   ?? '';
  const unitType  = (searchParams.get('unitType') ?? '') as UnitType;
  const season    = parseInt(searchParams.get('season') || '2025', 10);
  const breakdown = searchParams.get('breakdown') === 'true';
  const weekParam = searchParams.get('week') ? parseInt(searchParams.get('week')!, 10) : null;
  const currentWeekParam = searchParams.get('currentWeek')
  const currentWeek = currentWeekParam ? parseInt(currentWeekParam, 10) : 4

  if (!school || !unitType) {
    return NextResponse.json({ error: 'school and unitType required' }, { status: 400 });
  }

  const NO_STORE = { 'Cache-Control': 'no-store' };

  try {
    const admin = createAdminClient();

    const roundHalfUp2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

    // ── Breakdown mode: single-week player breakdown ──────────────────────────
    // Triggered by ?week=N (breakdown=true optional for backwards compat)
    if (weekParam !== null) {
      // Resolve game_id
      const { data: schedRow } = await admin
        .from('cached_schedule')
        .select('game_id')
        .eq('season', season)
        .eq('week', weekParam)
        .or(`home_team.eq.${school},away_team.eq.${school}`)
        .maybeSingle();

      if (!schedRow?.game_id) {
        return NextResponse.json({ breakdown: null, teNames: [], odrMult: 1 }, { headers: NO_STORE });
      }

      const gameId = schedRow.game_id;

      // Fetch all individual player stat rows + game_mult + team DEF stats in parallel
      const [playerRowsRes, multRes, teamRowsRes, allPlayersRes] = await Promise.all([
        admin.from('cached_stats').select('player_name, stat_type, value')
          .eq('game_id', gameId).eq('school', school)
          .not('player_name', 'is', null)
          .in('stat_type', [
            'passing_YDS','passing_TD','passing_INT',
            'rushing_YDS','rushing_TD','rushing_ATT',
            'receiving_YDS','receiving_REC','receiving_TD',
            'kicking_PTS',
          ]),
        admin.from('cached_stats').select('value')
          .eq('game_id', gameId).eq('school', school)
          .eq('stat_type', 'game_mult').is('player_name', null).maybeSingle(),
        admin.from('cached_stats').select('stat_type, value')
          .eq('game_id', gameId).eq('school', school).is('player_name', null)
          .in('stat_type', ['def_sacks','def_ints','def_fum_rec','def_tds','def_safeties']),
        admin.from('season_rosters').select('player_name, position')
          .eq('school', school).eq('season', season),
      ]);

      const odrMult  = multRes.data?.value ?? 1.0;

      // Build position lookup — single source of truth
      const playerPosMap: Record<string, string> = {};
      const stripSuffix = (n: string) => n.replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').trim()
      for (const p of allPlayersRes.data ?? []) {
        if (p.player_name && p.position) {
          const pn = p.player_name
          const stripped = stripSuffix(pn)
          playerPosMap[pn] = p.position
          playerPosMap[stripped] = p.position
          playerPosMap[pn.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()] = p.position
          playerPosMap[stripped.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()] = p.position
          playerPosMap[pn.toLowerCase().replace(/[^a-z0-9]/g, '')] = p.position
          playerPosMap[stripped.toLowerCase().replace(/[^a-z0-9]/g, '')] = p.position
        }
      }
      const teNameSet = new Set(
        Object.entries(playerPosMap).filter(([, pos]) => pos === 'TE').map(([name]) => name)
      );
      const rbNameSet = new Set(
        Object.entries(playerPosMap).filter(([, pos]) => pos === 'RB').map(([name]) => name)
      );
      const wrNameSet = new Set(
        Object.entries(playerPosMap).filter(([, pos]) => pos === 'WR').map(([name]) => name)
      );
      const qbNameSet = new Set(
        Object.entries(playerPosMap).filter(([, pos]) => pos === 'QB').map(([name]) => name)
      );

      // Group player stats by name
      const playerTotals: Record<string, Record<string, number>> = {};
      for (const row of playerRowsRes.data ?? []) {
        if (!row.player_name) continue;
        playerTotals[row.player_name] ??= {};
        playerTotals[row.player_name][row.stat_type] = row.value ?? 0;
      }

      type BdRow = {
        role: string; playerName: string | null;
        rawPts: number; multiplier: number; weightedPts: number;
        stats: Record<string, number>;
      };

      let bdRows: BdRow[] | null = null;

      if (unitType === 'DEF') {
        const ts: Record<string, number> = {};
        for (const r of teamRowsRes.data ?? []) ts[r.stat_type] = r.value ?? 0;
        const sacks    = ts['def_sacks']    ?? 0;
        const ints     = ts['def_ints']     ?? 0;
        const fumRec   = ts['def_fum_rec']  ?? 0;
        const defTd    = ts['def_tds']      ?? 0;
        const safeties = ts['def_safeties'] ?? 0;
        const rawDEF   = sacks*1 + ints*2 + fumRec*2 + defTd*6 + safeties*2;
        bdRows = [{ role: 'DEF', playerName: null, rawPts: rawDEF, multiplier: 1.0,
          weightedPts: roundHalfUp2(rawDEF),
          stats: { sacks, ints, fumRec, defTd, safeties } }];

      } else if (unitType === 'QB') {
        const qbs = Object.entries(playerTotals)
          .filter(([name, s]) => {
            const norm = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
            const noSp = name.toLowerCase().replace(/[^a-z0-9]/g, '')
            const isRB = rbNameSet.has(name) || rbNameSet.has(norm) || rbNameSet.has(noSp)
            const isTE = teNameSet.has(name) || teNameSet.has(norm) || teNameSet.has(noSp)
            const isWR = wrNameSet.has(name) || wrNameSet.has(norm) || wrNameSet.has(noSp)
            return qbNameSet.has(name) || qbNameSet.has(norm) || qbNameSet.has(noSp) ||
              (!isRB && !isWR && !isTE && ((s['passing_YDS'] ?? 0) > 0 || (s['passing_TD'] ?? 0) > 0))
          })
          .map(([name, s]) => ({
            name, s,
            rawPts: (s['passing_YDS']||0)*0.1 + (s['passing_TD']||0)*4 + (s['passing_INT']||0)*-3
                  + (s['rushing_YDS']||0)*0.1 + (s['rushing_TD']||0)*6,
          }))
          .sort((a, b) => b.rawPts - a.rawPts);
        if (qbs[0]) {
          bdRows = [{ role: 'QB', playerName: qbs[0].name, rawPts: qbs[0].rawPts,
            multiplier: 1.0, weightedPts: roundHalfUp2(qbs[0].rawPts),
            stats: qbs[0].s }];
        }

      } else if (unitType === 'K') {
        const ks = Object.entries(playerTotals)
          .filter(([, s]) => (s['kicking_PTS'] ?? 0) > 0)
          .map(([name, s]) => ({ name, rawPts: s['kicking_PTS'] || 0, s }))
          .sort((a, b) => b.rawPts - a.rawPts);
        if (ks[0]) {
          bdRows = [{ role: 'K', playerName: ks[0].name, rawPts: ks[0].rawPts,
            multiplier: 1.0, weightedPts: roundHalfUp2(ks[0].rawPts),
            stats: ks[0].s }];
        }

      } else if (unitType === 'RB') {
        const rbs = Object.entries(playerTotals)
          .filter(([name]) => {
            const norm = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
            const noSp = name.toLowerCase().replace(/[^a-z0-9]/g, '')
            return rbNameSet.has(name) || rbNameSet.has(norm) || rbNameSet.has(noSp)
          })
          .map(([name, s]) => ({
            name, s,
            // total yards × 0.1 + any TD × 6 (no reception points)
            rawPts: ((s['rushing_YDS']||0) + (s['receiving_YDS']||0)) * 0.1
                  + ((s['rushing_TD']||0) + (s['receiving_TD']||0)) * 6,
          }))
          .sort((a, b) => b.rawPts - a.rawPts);
        bdRows = rbs.slice(0, 3).map(({ name, rawPts, s }, i) => ({
          role: `RB${i+1}`, playerName: name, rawPts,
          multiplier: RB_W[i],
          weightedPts: roundHalfUp2(rawPts * RB_W[i]),
          stats: s,
        }));

      } else if (unitType === 'WR') {
        const wrs = Object.entries(playerTotals)
          .filter(([name]) => {
            const norm = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
            const noSp = name.toLowerCase().replace(/[^a-z0-9]/g, '')
            return wrNameSet.has(name) || wrNameSet.has(norm) || wrNameSet.has(noSp)
          })
          .map(([name, s]) => ({
            name, s,
            // total yards × 0.1 + TD × 6 (no reception points)
            rawPts: ((s['receiving_YDS']||0) + (s['rushing_YDS']||0)) * 0.1
                  + ((s['receiving_TD']||0) + (s['rushing_TD']||0)) * 6,
          }))
          .sort((a, b) => b.rawPts - a.rawPts);
        bdRows = wrs.slice(0, 3).map(({ name, rawPts, s }, i) => ({
          role: `WR${i+1}`, playerName: name, rawPts,
          multiplier: WR_W[i],
          weightedPts: roundHalfUp2(rawPts * WR_W[i]),
          stats: s,
        }));

      } else if (unitType === 'TE') {
        const tes = Object.entries(playerTotals)
          .filter(([name]) => {
            const norm = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
            const noSp = name.toLowerCase().replace(/[^a-z0-9]/g, '')
            return teNameSet.has(name) || teNameSet.has(norm) || teNameSet.has(noSp)
          })
          .map(([name, s]) => ({
            name, s,
            // total yards × 0.1 + TD × 6 (no reception points)
            rawPts: ((s['receiving_YDS']||0) + (s['rushing_YDS']||0)) * 0.1
                  + ((s['receiving_TD']||0) + (s['rushing_TD']||0)) * 6,
          }))
          .sort((a, b) => b.rawPts - a.rawPts);
        bdRows = tes.length > 0
          ? tes.slice(0, 2).map(({ name, rawPts, s }, i) => ({
              role: `TE${i+1}`, playerName: name, rawPts,
              multiplier: TE_W[i],
              weightedPts: roundHalfUp2(rawPts * TE_W[i]),
              stats: s,
            }))
          : null;
        if (!bdRows?.length) {
          console.error(`[unit-stats/breakdown] ${school} wk${weekParam} TE: no TE stats found (playerTotals=${Object.keys(playerTotals).length} teNames=[${Array.from(teNameSet).join(',')}])`);
        }
      }

      const result = bdRows && bdRows.length > 0 ? bdRows : null;
      const unitTotal = result
        ? roundHalfUp2(result.reduce((s, r) => s + r.weightedPts, 0))
        : 0;
      const fpts = roundHalfUp2(unitTotal * odrMult);
      return NextResponse.json(
        {
          bdRows: result,
          breakdown: result,
          teNames: Array.from(teNameSet),
          odrMult,
          odrLabel: odrLabelFromMult(odrMult),
          unitTotal,
          fpts,
        },
        { headers: NO_STORE },
      );
    }

    // ── Normal mode: full season game log ─────────────────────────────────────
    const ROLE_WEIGHTS: Record<string, number> = {
      rb1_opportunity: 1.0, rb2_opportunity: 0.7, rb3_opportunity: 0.4,
    };

    const [weeks, playersRes, roleRows] = await Promise.all([
      getSchoolWeekGameLog(school, unitType, season, currentWeek),
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
            .lte('week', 4)
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

    const { data: coachProfile } = await admin
      .from('team_coaching_profiles')
      .select('head_coach, hc_philosophy, off_coordinator, pass_rate, rush_rate, explosiveness, tempo, plays_per_game, aggressiveness_score')
      .eq('school', school)
      .eq('season', season)
      .single();

    return NextResponse.json(
      { school, unitType, weeks, jerseyMap, playerRoles, coachProfile: coachProfile ?? null },
      { headers: NO_STORE },
    );
  } catch (err: any) {
    console.error('unit-stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
