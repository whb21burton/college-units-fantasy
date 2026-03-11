/**
 * POST /api/calculate-scores
 * Body: { league_id: string }
 *
 * Uses the league's draft_order + snakeIndex to correctly attribute every
 * draft pick to its team (human or CPU), then computes weekly scores for
 * all 11 regular-season weeks in parallel.
 *
 * Human scores  → upserted into weekly_scores table
 * CPU scores    → saved into league.settings.cpu_weekly_scores (no auth.users FK)
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

const REG_SEASON_WEEKS = 11;

function snakeIndex(pickNum: number, numTeams: number): number {
  const round = Math.floor(pickNum / numTeams);
  const pos   = pickNum % numTeams;
  return round % 2 === 0 ? pos : numTeams - 1 - pos;
}

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

function autoStarters(picks: any[]): any[] {
  const byPos: Record<string, any[]> = { QB: [], RB: [], WR: [], TE: [], DEF: [], K: [] };
  for (const p of picks) {
    const pos = p.player_data?.unitType;
    if (pos && byPos[pos]) byPos[pos].push(p);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  }
  const used = new Set<string>();
  const take = (arr: any[]) => { const p = arr.find(x => !used.has(x.id)) ?? null; if (p) used.add(p.id); return p; };
  const flex = [...byPos.RB, ...byPos.WR, ...byPos.TE]
    .filter(p => !used.has(p.id))
    .sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0))[0] ?? null;

  const slots = [
    take(byPos.QB),
    take(byPos.RB), take(byPos.RB),
    take(byPos.WR), take(byPos.WR),
    take(byPos.TE),
    null, // FLEX placeholder — filled below after TE slot consumed
    take(byPos.DEF),
    take(byPos.K),
  ];
  // Re-compute flex after all positional slots consumed
  const flexPick = [...byPos.RB, ...byPos.WR, ...byPos.TE]
    .filter(p => !used.has(p.id))
    .sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0))[0] ?? null;
  if (flexPick) used.add(flexPick.id);
  slots[6] = flexPick;
  void flex; // suppress unused warning
  return slots.filter(Boolean);
}

function scoreStarters(
  starters:         any[],
  lineupIds:        string[] | undefined,
  allPicksForTeam:  any[],
  completedSchools: string[],
  schoolPoints:     Record<string, Record<string, number>>,
  opponentMap:      Record<string, string>,
  rankMap:          Record<string, number>,
  hasOpponentData:  boolean,
): number {
  // If a lineup is saved for this week, resolve those specific picks
  const effectiveStarters = lineupIds?.length === 9
    ? lineupIds.map((id: string) => allPicksForTeam.find((p: any) => p.id === id)).filter(Boolean)
    : starters;

  let score = 0;
  for (const pick of effectiveStarters) {
    const school    = pick.player_data?.school    ?? '';
    const unitType  = pick.player_data?.unitType  ?? '';
    const seasonPts = pick.player_data?.projectedPoints ?? 0;

    const opponent = opponentMap[school] ?? null;
    // BYE = 0 (only apply when we actually have opponent data for the week)
    if (hasOpponentData && !opponent) continue;

    const relevantRank = opponent ? (rankMap[opponent] ?? 999) : 999;
    const mult = rankMult(relevantRank);

    const pts = completedSchools.includes(school)
      ? (schoolPoints[school]?.[unitType] ?? 0) * mult
      : (seasonPts / 12) * mult;

    score += pts;
  }
  return Math.round(score * 100) / 100;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { league_id } = body;
    if (!league_id) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

    const admin = createAdminClient();

    // Fetch league, members, and all draft picks
    const [{ data: league }, { data: members }, { data: allPicks }] = await Promise.all([
      admin.from('leagues').select('*').eq('id', league_id).single(),
      admin.from('league_members').select('id, user_id, team_name, roster').eq('league_id', league_id),
      admin.from('draft_picks').select('*').eq('league_id', league_id).order('pick_number', { ascending: true }),
    ]);

    if (!league)          return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (!members?.length) return NextResponse.json({ error: 'No members found' }, { status: 404 });

    const draftOrder: any[] = league.settings?.draft_order ?? [];
    const numTeams = draftOrder.length;

    // Build per-team pick lists using snakeIndex when draft_order is available,
    // otherwise fall back to user_id matching.
    type TeamEntry = {
      type:       'human' | 'cpu';
      userId?:    string;
      teamName:   string;
      slot:       number; // 1-indexed
      picks:      any[];
      memberId?:  string;
      roster?:    any;
    };

    const teams: TeamEntry[] = [];

    if (numTeams > 0 && allPicks?.length) {
      // Group picks by slot via snakeIndex
      const picksBySlot: Record<number, any[]> = {};
      for (const pick of allPicks) {
        const slotIdx = snakeIndex(pick.pick_number, numTeams); // 0-indexed
        if (!picksBySlot[slotIdx]) picksBySlot[slotIdx] = [];
        picksBySlot[slotIdx].push(pick);
      }

      for (let i = 0; i < draftOrder.length; i++) {
        const dt = draftOrder[i];
        const member = dt.userId
          ? members.find((m: any) => m.user_id === dt.userId)
          : undefined;
        teams.push({
          type:      dt.type ?? 'cpu',
          userId:    dt.userId,
          teamName:  dt.teamName ?? member?.team_name ?? `Team ${i + 1}`,
          slot:      i + 1,
          picks:     picksBySlot[i] ?? [],
          memberId:  member?.id,
          roster:    member?.roster,
        });
      }
    } else {
      // Fallback: no draft_order — use user_id filtering for human members only
      for (const m of members) {
        teams.push({
          type:     'human',
          userId:   m.user_id,
          teamName: m.team_name,
          slot:     1,
          picks:    (allPicks ?? []).filter((p: any) => p.user_id === m.user_id),
          memberId: m.id,
          roster:   m.roster,
        });
      }
    }

    // Derive base URL for internal API calls
    const host  = req.headers.get('host') ?? 'localhost:3000';
    const proto = host.startsWith('localhost') ? 'http' : 'https';
    const base  = `${proto}://${host}`;

    // Fetch all 11 weeks in parallel
    const weekData = await Promise.all(
      Array.from({ length: REG_SEASON_WEEKS }, (_, i) => i + 1).map(async (week) => {
        const [gsRes, ctxRes] = await Promise.all([
          fetch(`${base}/api/game-stats?week=${week}&season=2025`),
          fetch(`${base}/api/matchup-context?week=${week}&season=2025`),
        ]);
        const gs  = gsRes.ok  ? await gsRes.json()  : {};
        const ctx = ctxRes.ok ? await ctxRes.json() : {};
        return { week, gs, ctx };
      })
    );

    const humanUpserts: any[] = [];
    // cpu_weekly_scores: { [teamName]: { [week]: score } }
    const cpuScores: Record<string, Record<number, number>> = {};

    for (const { week, gs, ctx } of weekData) {
      const completedSchools: string[]                               = gs.completedSchools  ?? [];
      const schoolPoints:     Record<string, Record<string, number>> = gs.schoolPoints      ?? {};
      const opponentMap:      Record<string, string>                 = ctx.opponentMap      ?? {};
      const rankMap:          Record<string, number>                 = ctx.rankMap          ?? {};
      const hasOpponentData   = Object.keys(opponentMap).length > 0;

      for (const team of teams) {
        const starters   = autoStarters(team.picks);
        const lineupIds  = team.roster?.lineups?.[String(week)];
        const score      = scoreStarters(
          starters, lineupIds, team.picks,
          completedSchools, schoolPoints, opponentMap, rankMap, hasOpponentData,
        );

        if (team.type === 'human' && team.userId) {
          humanUpserts.push({
            league_id,
            user_id:         team.userId,
            week,
            score,
            base_score:      score,
            adjusted_score:  score,
            multiplier_used: 1.00,
            calculated_at:   new Date().toISOString(),
          });
        } else {
          // CPU team — store by team name
          if (!cpuScores[team.teamName]) cpuScores[team.teamName] = {};
          cpuScores[team.teamName][week] = score;
        }
      }
    }

    // Upsert human scores
    if (humanUpserts.length) {
      const { error: upsertErr } = await admin
        .from('weekly_scores')
        .upsert(humanUpserts, { onConflict: 'league_id,user_id,week' });
      if (upsertErr) throw upsertErr;
    }

    // Persist CPU scores into league.settings
    if (Object.keys(cpuScores).length) {
      const updatedSettings = {
        ...league.settings,
        cpu_weekly_scores: cpuScores,
      };
      const { error: settingsErr } = await admin
        .from('leagues')
        .update({ settings: updatedSettings })
        .eq('id', league_id);
      if (settingsErr) throw settingsErr;
    }

    return NextResponse.json({
      success:          true,
      weeksCalculated:  REG_SEASON_WEEKS,
      humanRows:        humanUpserts.length,
      cpuTeams:         Object.keys(cpuScores).length,
    });
  } catch (err: any) {
    console.error('calculate-scores error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
