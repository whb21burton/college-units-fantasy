import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET /api/waiver/priority?league_id=X — ordered priority list with display names
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leagueId = new URL(req.url).searchParams.get('league_id');
  if (!leagueId) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

  const admin = createAdminClient();

  // Fetch priority list joined to user metadata for display names
  const { data: priority, error } = await admin
    .from('waiver_priority')
    .select('*')
    .eq('league_id', leagueId)
    .order('priority_position', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with display names from league_members
  const { data: members } = await admin
    .from('league_members')
    .select('user_id, team_name')
    .eq('league_id', leagueId);

  const nameMap: Record<string, string> = {};
  for (const m of members ?? []) nameMap[m.user_id] = m.team_name ?? m.user_id?.slice(0, 8);

  const enriched = (priority ?? []).map(p => ({
    ...p,
    display_name: nameMap[p.user_id] ?? p.user_id?.slice(0, 8),
  }));

  return NextResponse.json({ priority: enriched });
}

// POST /api/waiver/priority — commissioner resets priority order
// Body: { league_id, order: [user_id, ...] }
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { league_id, order } = await req.json();
  if (!league_id || !Array.isArray(order)) {
    return NextResponse.json({ error: 'league_id and order[] required' }, { status: 400 });
  }

  // Verify commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', league_id)
    .single();
  if (league?.commissioner_id !== user.id) {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Upsert priority rows
  const rows = order.map((userId: string, i: number) => ({
    league_id,
    user_id: userId,
    priority_position: i + 1,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin
    .from('waiver_priority')
    .upsert(rows, { onConflict: 'league_id,user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
