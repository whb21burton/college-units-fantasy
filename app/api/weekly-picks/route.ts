import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** GET /api/weekly-picks?league_id=xxx
 *  Returns all members' picks + team names for the leaderboard. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league_id = searchParams.get('league_id');
  if (!league_id) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Must be a member
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const [picksRes, membersRes] = await Promise.all([
    supabase
      .from('weekly_picks')
      .select('user_id, picks, total_points')
      .eq('league_id', league_id),
    supabase
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', league_id),
  ]);

  return NextResponse.json({
    picks:   picksRes.data   ?? [],
    members: membersRes.data ?? [],
  });
}

/** POST /api/weekly-picks
 *  Body: { league_id, picks: Record<slot, school> }
 *  Saves / replaces the authenticated user's picks for a weekly league. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { league_id, picks } = body as {
    league_id?: string;
    picks?: Record<string, string>;
  };

  if (!league_id || !picks) {
    return NextResponse.json({ error: 'league_id and picks required' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Must be a member
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // League must be in 'active' status to accept picks
  const { data: league } = await supabase
    .from('leagues')
    .select('status')
    .eq('id', league_id)
    .single();
  if (league?.status !== 'active') {
    return NextResponse.json({ error: 'Picks are not open for this league' }, { status: 400 });
  }

  const { error } = await supabase
    .from('weekly_picks')
    .upsert(
      { league_id, user_id: user.id, picks, updated_at: new Date().toISOString() },
      { onConflict: 'league_id,user_id' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

/** POST /api/weekly-picks/score  →  handled via ?action=score query param
 *  Commissioner only. Fetches actual game scores from unit-stats API
 *  and writes total_points for each member. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { league_id } = body as { league_id?: string };
  if (!league_id) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Must be commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, week')
    .eq('id', league_id)
    .single();
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (league.commissioner_id !== user.id) {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 });
  }

  const week = league.week;
  if (!week) return NextResponse.json({ error: 'No week set on this league' }, { status: 400 });

  // Fetch all picks
  const { data: allPicks } = await supabase
    .from('weekly_picks')
    .select('user_id, picks')
    .eq('league_id', league_id);

  if (!allPicks?.length) return NextResponse.json({ updated: 0 });

  // Collect unique (school, unitType) combos to fetch
  const combos = new Set<string>();
  for (const p of allPicks) {
    const picks = p.picks as Record<string, string>;
    const slotToType: Record<string, string> = {
      QB1: 'QB', RB1: 'RB', RB2: 'RB', WR1: 'WR', WR2: 'WR',
      TE1: 'TE', DEF: 'DEF', K: 'K',
    };
    for (const [slot, school] of Object.entries(picks)) {
      const ut = slotToType[slot];
      if (ut && school) combos.add(`${school}|||${ut}`);
    }
  }

  // Fetch scores in parallel from unit-stats API
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const scoreMap: Record<string, number> = {}; // key = `school|||unitType`
  await Promise.all(
    Array.from(combos).map(async (combo) => {
      const [school, ut] = combo.split('|||');
      try {
        const r = await fetch(
          `${baseUrl}/api/unit-stats?school=${encodeURIComponent(school)}&unitType=${ut}&season=2025`,
        );
        const d = await r.json();
        const weekData = d.weeks?.find((w: any) => w.week === week);
        scoreMap[combo] = weekData?.fantasyPoints ?? 0;
      } catch {
        scoreMap[combo] = 0;
      }
    }),
  );

  // Calculate and update each member's total
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const slotToType: Record<string, string> = {
    QB1: 'QB', RB1: 'RB', RB2: 'RB', WR1: 'WR', WR2: 'WR',
    TE1: 'TE', DEF: 'DEF', K: 'K',
  };

  let updated = 0;
  for (const p of allPicks) {
    let total = 0;
    for (const [slot, school] of Object.entries(p.picks as Record<string, string>)) {
      const ut = slotToType[slot];
      if (ut && school) total += scoreMap[`${school}|||${ut}`] ?? 0;
    }
    await admin
      .from('weekly_picks')
      .update({ total_points: Math.round(total * 100) / 100 })
      .eq('league_id', league_id)
      .eq('user_id', p.user_id);
    updated++;
  }

  return NextResponse.json({ updated, scoreMap });
}
