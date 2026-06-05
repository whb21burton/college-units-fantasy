import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const BUDGET = 200;

// Required slots for a valid DFS lineup
const REQUIRED_SLOTS: Record<string, number> = {
  QB:   1,
  RB:   2,
  WR:   2,
  TE:   1,
  FLEX: 1,  // RB/WR/TE
  DEF:  1,
  K:    1,
};
const TOTAL_STARTERS = 9;

/**
 * POST /api/lineup/submit
 * Body: { league_id, week, picks: Array<{ unit_id, slot, salary_cost }> }
 *
 * Validates 9 starters + total salary ≤ $200, then upserts into draft_picks
 * with entry_type = 'lineup'.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { league_id, week, picks } = body as {
      league_id?: string;
      week?: number;
      picks?: Array<{ unit_id: string; slot: string; slot_key?: string; salary_cost: number; player_data?: any }>;
    };

    if (!league_id || !week || !picks?.length) {
      return NextResponse.json({ error: 'league_id, week, and picks are required' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Verify league is weekly and user is a member
    const { data: league } = await admin
      .from('leagues')
      .select('id, league_type, status')
      .eq('id', league_id)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.league_type !== 'weekly') {
      return NextResponse.json({ error: 'Lineup submission is only for weekly leagues' }, { status: 400 });
    }

    const { data: member } = await admin
      .from('league_members')
      .select('id')
      .eq('league_id', league_id)
      .eq('user_id', user.id)
      .single();

    if (!member) return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });

    // TODO: re-enable when season is live
    // Skip lock check for testing
    const TESTING_MODE = true;
    if (!TESTING_MODE) {

    // Server-side lineup lock: reject any pick whose school's game has started.
    // Units whose school hasn't kicked off yet are still swappable.
    const schoolSet = new Set(picks.map(p => p.player_data?.school).filter(Boolean));
    const schools = Array.from(schoolSet) as string[];

    if (schools.length > 0) {
      const { data: games } = await admin
        .from('cached_schedule')
        .select('home_team, away_team, game_date')
        .eq('season', 2025)
        .eq('week', week)
        .or(schools.map(s => `home_team.eq.${s},away_team.eq.${s}`).join(','));

      // Build a map of school -> game_date
      const kickoffMap: Record<string, string> = {};
      for (const g of games ?? []) {
        if (g.game_date) {
          if (g.home_team) kickoffMap[g.home_team] = g.game_date;
          if (g.away_team) kickoffMap[g.away_team] = g.game_date;
        }
      }

      const now = new Date();
      const lockedSchools: string[] = [];
      for (const pick of picks) {
        const school = pick.player_data?.school;
        if (!school) continue;
        const kickoff = kickoffMap[school];
        if (kickoff && now >= new Date(kickoff)) {
          lockedSchools.push(school);
        }
      }

      if (lockedSchools.length > 0) {
        return NextResponse.json({
          error: `Lineup locked — the following units have already kicked off: ${Array.from(new Set(lockedSchools)).join(', ')}`,
        }, { status: 403 });
      }
    }
    } // end !TESTING_MODE

    // Validate picks count
    if (picks.length !== TOTAL_STARTERS) {
      return NextResponse.json({
        error: `Lineup must have exactly ${TOTAL_STARTERS} starters, got ${picks.length}`,
      }, { status: 400 });
    }

    // Validate slot counts
    const slotCounts: Record<string, number> = {};
    for (const p of picks) {
      slotCounts[p.slot] = (slotCounts[p.slot] ?? 0) + 1;
    }
    for (const [slot, needed] of Object.entries(REQUIRED_SLOTS)) {
      if ((slotCounts[slot] ?? 0) !== needed) {
        return NextResponse.json({
          error: `Invalid lineup: need ${needed} ${slot} slot(s), got ${slotCounts[slot] ?? 0}`,
        }, { status: 400 });
      }
    }

    // Validate FLEX is RB/WR/TE
    const flexPick = picks.find(p => p.slot === 'FLEX');
    if (flexPick?.player_data?.unitType && !['RB', 'WR', 'TE'].includes(flexPick.player_data.unitType)) {
      return NextResponse.json({ error: 'FLEX must be RB, WR, or TE' }, { status: 400 });
    }

    // Validate budget
    const totalSalary = picks.reduce((sum, p) => sum + (p.salary_cost ?? 0), 0);
    if (totalSalary > BUDGET) {
      return NextResponse.json({
        error: `Lineup exceeds $${BUDGET} budget (used $${totalSalary})`,
      }, { status: 400 });
    }

    // Delete previous lineup for this user / league / week, then insert fresh
    await admin
      .from('draft_picks')
      .delete()
      .eq('league_id', league_id)
      .eq('user_id', user.id)
      .eq('week', week)
      .eq('entry_type', 'lineup');

    // Store slot + salary inside player_data to avoid schema cache issues
    // with the separately-added 'slot' column.
    // Use random pick_numbers to avoid the legacy unique(league_id, pick_number) constraint.
    const rows = picks.map((p, i) => ({
      league_id,
      user_id:     user.id,
      player_id:   p.unit_id,
      player_data: { ...(p.player_data ?? {}), _slot: p.slot_key ?? p.slot, _salary: p.salary_cost },
      round:       0,
      pick_number: Math.floor(Math.random() * 1_000_000_000) + i,
      week,
      entry_type:  'lineup',
    }));

    const { error: insertErr } = await admin.from('draft_picks').insert(rows);
    if (insertErr) throw insertErr;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[lineup-submit]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to submit lineup' }, { status: 500 });
  }
}
