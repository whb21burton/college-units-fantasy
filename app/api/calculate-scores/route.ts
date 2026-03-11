/**
 * POST /api/calculate-scores
 * Body: { league_id: string }
 *
 * For each regular-season week (1–11), fetches actual game stats and matchup
 * context, computes each member's weekly score from their starting lineup
 * (or auto-assigned starters if no lineup is saved), and upserts to
 * weekly_scores.
 *
 * All 11 weeks are fetched in parallel for speed.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

const REG_SEASON_WEEKS = 11;

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
  const used  = new Set<string>();
  const take  = (arr: any[]) => { const p = arr.find(x => !used.has(x.id)) ?? null; if (p) used.add(p.id); return p; };
  const slots = [
    take(byPos.QB),
    take(byPos.RB), take(byPos.RB),
    take(byPos.WR), take(byPos.WR),
    take(byPos.TE),
    [...byPos.RB, ...byPos.WR, ...byPos.TE].filter(p => !used.has(p.id)).sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0))[0] ?? null,
    take(byPos.DEF),
    take(byPos.K),
  ];
  if (slots[6]) used.add(slots[6].id);
  return slots.filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { league_id } = body;
    if (!league_id) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

    const admin = createAdminClient();

    // Fetch members + all picks in parallel
    const [{ data: members }, { data: allPicks }] = await Promise.all([
      admin.from('league_members').select('id, user_id, team_name, roster').eq('league_id', league_id),
      admin.from('draft_picks').select('*').eq('league_id', league_id).order('pick_number', { ascending: true }),
    ]);

    if (!members?.length) return NextResponse.json({ error: 'No members found' }, { status: 404 });

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
        const gs  = gsRes.ok  ? await gsRes.json()  : { completedSchools: [], schoolPoints: {} };
        const ctx = ctxRes.ok ? await ctxRes.json() : { opponentMap: {}, rankMap: {} };
        return { week, gs, ctx };
      })
    );

    const allUpserts: any[] = [];

    for (const { week, gs, ctx } of weekData) {
      const completedSchools: string[]                          = gs.completedSchools  ?? [];
      const schoolPoints:     Record<string, Record<string, number>> = gs.schoolPoints ?? {};
      const opponentMap:      Record<string, string>            = ctx.opponentMap      ?? {};
      const rankMap:          Record<string, number>            = ctx.rankMap          ?? {};

      for (const member of members) {
        const userPicks  = (allPicks ?? []).filter((p: any) => p.user_id === member.user_id);
        const lineupIds: string[] | undefined = member.roster?.lineups?.[String(week)];
        const starters   = lineupIds?.length === 9
          ? lineupIds.map((id: string) => userPicks.find((p: any) => p.id === id)).filter(Boolean)
          : autoStarters(userPicks);

        let score = 0;
        for (const pick of starters) {
          const school    = pick.player_data?.school    ?? '';
          const unitType  = pick.player_data?.unitType  ?? '';
          const seasonPts = pick.player_data?.projectedPoints ?? 0;

          const opponent = opponentMap[school] ?? null;
          // BYE week = 0 points
          if (Object.keys(opponentMap).length > 0 && !opponent) continue;

          const relevantRank = opponent ? (rankMap[opponent] ?? 999) : 999;
          const mult = rankMult(relevantRank);

          const pts = completedSchools.includes(school)
            ? (schoolPoints[school]?.[unitType] ?? 0) * mult
            : (seasonPts / 12) * mult;

          score += pts;
        }

        allUpserts.push({
          league_id,
          user_id:        member.user_id,
          week,
          score:          Math.round(score * 100) / 100,
          base_score:     Math.round(score * 100) / 100,
          adjusted_score: Math.round(score * 100) / 100,
          multiplier_used: 1.00,
          calculated_at:  new Date().toISOString(),
        });
      }
    }

    // Upsert in one batch
    const { error: upsertErr } = await admin
      .from('weekly_scores')
      .upsert(allUpserts, { onConflict: 'league_id,user_id,week' });

    if (upsertErr) throw upsertErr;

    return NextResponse.json({
      success:         true,
      weeksCalculated: REG_SEASON_WEEKS,
      rowsUpserted:    allUpserts.length,
    });
  } catch (err: any) {
    console.error('calculate-scores error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
