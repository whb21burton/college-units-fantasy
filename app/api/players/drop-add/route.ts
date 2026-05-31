import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/players/drop-add
 * Body: { league_id, week, drop_unit_id, add_unit_id, drop_school, add_school }
 *
 * Rules:
 *  - drop_unit's school game must NOT have started yet
 *  - add_unit's school game must NOT have started yet
 *  - Both checks use cached_schedule.game_date for current season + week
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { league_id, week, drop_unit_id, add_unit_id, drop_school, add_school } = body as {
      league_id?: string;
      week?: number;
      drop_unit_id?: string;
      add_unit_id?: string;
      drop_school?: string;
      add_school?: string;
    };

    if (!league_id || !week || !drop_unit_id || !add_unit_id) {
      return NextResponse.json(
        { error: 'league_id, week, drop_unit_id, and add_unit_id are required' },
        { status: 400 },
      );
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Verify league membership
    const { data: member } = await admin
      .from('league_members')
      .select('id')
      .eq('league_id', league_id)
      .eq('user_id', user.id)
      .single();

    if (!member) return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });

    // Check kickoff status for both the dropped and added unit's school
    const schoolsToCheck = [drop_school, add_school].filter(Boolean) as string[];

    const { data: games } = await admin
      .from('cached_schedule')
      .select('home_team, away_team, game_date')
      .eq('season', new Date().getFullYear())
      .eq('week', week)
      .or(schoolsToCheck.map(s => `home_team.eq.${s},away_team.eq.${s}`).join(','));

    const kickoffMap: Record<string, string> = {};
    for (const g of games ?? []) {
      if (g.game_date) {
        if (g.home_team) kickoffMap[g.home_team] = g.game_date;
        if (g.away_team) kickoffMap[g.away_team] = g.game_date;
      }
    }

    const now = new Date();

    if (drop_school && kickoffMap[drop_school] && now >= new Date(kickoffMap[drop_school])) {
      return NextResponse.json(
        { error: `Cannot drop ${drop_school} — their game has already started` },
        { status: 403 },
      );
    }

    if (add_school && kickoffMap[add_school] && now >= new Date(kickoffMap[add_school])) {
      return NextResponse.json(
        { error: `Cannot add ${add_school} — their game has already started` },
        { status: 403 },
      );
    }

    // Perform the drop: remove drop_unit from this user's lineup for this week
    const { error: dropErr } = await admin
      .from('draft_picks')
      .delete()
      .eq('league_id', league_id)
      .eq('user_id', user.id)
      .eq('week', week)
      .eq('player_id', drop_unit_id)
      .eq('entry_type', 'lineup');

    if (dropErr) throw dropErr;

    // Mark add_unit as taken by this user (insert a placeholder row)
    // The user still needs to resubmit their full lineup — this just reserves the unit
    // and removes it from the available pool for other managers.
    const { error: addErr } = await admin
      .from('draft_picks')
      .insert({
        league_id,
        user_id:     user.id,
        player_id:   add_unit_id,
        player_data: { _slot: 'PENDING', _salary: 0, school: add_school },
        round:       0,
        pick_number: Math.floor(Math.random() * 1_000_000_000),
        week,
        entry_type:  'pickup',
      });

    if (addErr) throw addErr;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[drop-add]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to process drop/add' }, { status: 500 });
  }
}
