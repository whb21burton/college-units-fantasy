/**
 * POST /api/cron/weekly-sync
 *
 * Runs every Sunday at 8AM (vercel.json: "0 8 * * 0").
 * 1. Reads current_week from platform_settings.
 * 2. Syncs scores + stats for the week from CFBD.
 * 3. For every active seasonal league, calculates each team's actual score
 *    and upserts a row into the matchups table.
 *
 * Auth: Bearer CRON_SECRET (Vercel) OR authenticated admin session (admin panel).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-server';
import { syncStats, syncScores } from '@/lib/sportsDataService';
import { getUnitPointsForWeek } from '@/lib/sportsDataReader';
import { CONFERENCES } from '@/lib/playerPool';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CURRENT_SEASON = 2026;
const ADMIN_EMAIL    = 'whb21burton@gmail.com';
const ALL_SCHOOLS    = Object.values(CONFERENCES).flat();

// ── Helpers (mirrors client-side logic) ─────────────────────────────────────

function snakeIdx(pickNum: number, numTeams: number): number {
  const round = Math.floor(pickNum / numTeams);
  const pos   = pickNum % numTeams;
  return round % 2 === 0 ? pos : numTeams - 1 - pos;
}

function getWeekMatchups(teams: any[], week: number): [any, any][] {
  const n = teams.length;
  if (n < 2 || n % 2 !== 0) return [];
  const rest    = teams.slice(1);
  const rotated = rest.map((_, i) => rest[(i + week - 1) % rest.length]);
  const ordered = [teams[0], ...rotated];
  const result: [any, any][] = [];
  for (let i = 0; i < n / 2; i++) result.push([ordered[i], ordered[n - 1 - i]]);
  return result;
}

function autoAssignStarters(picks: any[]): any[] {
  const byPos: Record<string, any[]> = { QB: [], RB: [], WR: [], TE: [], DEF: [], K: [] };
  for (const p of picks) {
    const pos = p.player_data?.unitType as string;
    if (pos && byPos[pos]) byPos[pos].push(p);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  }
  const usedIds = new Set<string>();
  function take(arr: any[]): any {
    const p = arr.find(x => !usedIds.has(x.id)) ?? null;
    if (p) usedIds.add(p.id);
    return p;
  }
  const flexPool = [...byPos.RB, ...byPos.WR, ...byPos.TE];
  const qb  = take(byPos.QB);
  const rb1 = take(byPos.RB);
  const rb2 = take(byPos.RB);
  const wr1 = take(byPos.WR);
  const wr2 = take(byPos.WR);
  const te  = take(byPos.TE);
  flexPool.sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  const flex = flexPool.find(p => !usedIds.has(p.id)) ?? null;
  if (flex) usedIds.add(flex.id);
  const def = take(byPos.DEF);
  const k   = take(byPos.K);
  return [qb, rb1, rb2, wr1, wr2, te, flex, def, k].filter(Boolean);
}

function calcTeamScore(
  picks: any[],
  starterIds: (string | null)[] | null | undefined,
  schoolPoints: Record<string, Partial<Record<string, number>>>,
  schoolMults: Record<string, number>,
): number {
  let starters: any[];
  if (starterIds?.some(id => id !== null)) {
    starters = starterIds
      .filter((id): id is string => id !== null)
      .map(id => picks.find((p: any) => p.id === id))
      .filter(Boolean);
  } else {
    starters = autoAssignStarters(picks);
  }
  return starters.reduce((sum, pick) => {
    const school   = pick.player_data?.school as string;
    const unitType = pick.player_data?.unitType as string;
    const base     = schoolPoints[school]?.[unitType as any];
    if (base == null) return sum;
    const mult = schoolMults[school] ?? 1;
    return sum + base * mult;
  }, 0);
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth: Vercel cron secret OR admin session
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const start = Date.now();

  try {
    // 1. Resolve week: ?week= param overrides platform_settings
    const weekParam = new URL(request.url).searchParams.get('week');
    let week: number;
    if (weekParam) {
      week = parseInt(weekParam, 10);
    } else {
      const { data: weekRow } = await admin
        .from('platform_settings')
        .select('value')
        .eq('key', 'current_week')
        .single();
      week = parseInt(weekRow?.value ?? '1', 10);
    }

    // 2. Sync scores + stats (batched to avoid timeouts)
    const scoresUpdated = await syncScores(week, CURRENT_SEASON);
    let statsUpdated = 0;
    const BATCH = 15;
    for (let i = 0; i < ALL_SCHOOLS.length; i += BATCH) {
      statsUpdated += await syncStats(week, CURRENT_SEASON, ALL_SCHOOLS.slice(i, i + BATCH));
    }

    // 3. Load cached scoring data for this week
    const { schoolPoints, schoolMults } = await getUnitPointsForWeek(week, CURRENT_SEASON);

    // 4. Get all active seasonal leagues
    const { data: leagues } = await admin
      .from('leagues')
      .select('id, settings, current_week')
      .eq('league_type', 'season')
      .eq('status', 'active');

    let leaguesUpdated = 0;
    let matchupsUpdated = 0;

    for (const league of leagues ?? []) {
      const draftOrder: any[] = league.settings?.draft_order ?? [];
      const storedSchedule: any[] = league.settings?.schedule ?? [];
      const numTeams = draftOrder.length;
      if (numTeams < 2) continue;

      // Fetch all picks and member lineups
      const { data: allPicks } = await admin
        .from('draft_picks')
        .select('id, pick_number, player_data')
        .eq('league_id', league.id);
      if (!allPicks?.length) continue;

      // Select league_members.id (PK) — works for CPU bots whose user_id is NULL
      const { data: members } = await admin
        .from('league_members')
        .select('id, user_id, team_name, roster')
        .eq('league_id', league.id);

      // teamName → league_members.id (non-null for every row, including CPU bots)
      const memberByName: Record<string, string> = {};
      for (const m of members ?? []) {
        if (m.team_name) memberByName[m.team_name] = m.id;
      }

      // scheduleId → { slot, memberId }
      // scheduleId = userId for humans, teamName for CPUs (set by generateSchedule)
      // memberId = league_members.id — non-null for all team types
      const teamByScheduleId: Record<string, { slot: number; memberId: string | undefined }> = {};
      for (const t of draftOrder) {
        const scheduleId = t.userId ?? t.teamName;
        teamByScheduleId[scheduleId] = { slot: t.slot, memberId: memberByName[t.teamName] };
      }

      // Lineup overrides keyed by league_members.id
      const weekKey = `week_${week}`;
      const lineupMap: Record<string, (string | null)[]> = {};
      for (const m of members ?? []) {
        const lineup = m.roster?.lineups?.[weekKey];
        if (lineup) lineupMap[m.id] = lineup;
      }

      // Use settings.schedule (source of truth) — works for any team count including odd.
      const weekGames = storedSchedule.filter((g: any) => g.week === week);

      // Fall back to getWeekMatchups for leagues without a stored schedule.
      const weekMatchups: [any, any][] = weekGames.length > 0
        ? weekGames
            .map((g: any) => {
              const t1 = teamByScheduleId[g.home];
              const t2 = teamByScheduleId[g.away];
              return t1 && t2 ? [t1, t2] as [any, any] : null;
            })
            .filter((pair): pair is [any, any] => pair !== null)
        : getWeekMatchups(draftOrder, week);

      for (const [team1, team2] of weekMatchups) {
        const picks1 = allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === team1.slot - 1);
        const picks2 = allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === team2.slot - 1);

        const score1 = parseFloat(calcTeamScore(picks1, team1.memberId ? lineupMap[team1.memberId] : undefined, schoolPoints, schoolMults).toFixed(2));
        const score2 = parseFloat(calcTeamScore(picks2, team2.memberId ? lineupMap[team2.memberId] : undefined, schoolPoints, schoolMults).toFixed(2));
        const winnerId = score1 > score2 ? (team1.memberId ?? null) : score2 > score1 ? (team2.memberId ?? null) : null;

        // Skip if either team has no resolvable member ID
        if (!team1.memberId || !team2.memberId) continue;

        await admin.from('matchups').upsert(
          {
            league_id:   league.id,
            week,
            team1_id:    team1.memberId,
            team2_id:    team2.memberId,
            team1_score: score1,
            team2_score: score2,
            winner_id:   winnerId,
          },
          { onConflict: 'league_id,week,team1_id' },
        );
        matchupsUpdated++;
      }
      leaguesUpdated++;
    }

    return NextResponse.json({
      success: true, week, scoresUpdated, statsUpdated,
      leaguesUpdated, matchupsUpdated, duration: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[cron/weekly-sync]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
