import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET /api/waiver/claims?league_id=X[&status=pending|processed]
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get('league_id');
  const statusFilter = searchParams.get('status'); // 'pending' | 'processed'
  if (!leagueId) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

  let query = supabase
    .from('waiver_claims')
    .select('*')
    .eq('league_id', leagueId)
    .order('priority_rank', { ascending: true })
    .order('created_at',    { ascending: true });

  if (statusFilter === 'processed') {
    query = query.in('status', ['awarded', 'failed']);
  } else if (statusFilter === 'pending') {
    query = query.eq('status', 'pending').eq('user_id', user.id);
  } else {
    // Default: return this user's pending claims
    query = query.eq('status', 'pending').eq('user_id', user.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claims: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { league_id, add_unit_id, drop_unit_id, bid_amount = 0, priority_rank = 1 } = body;

  if (!league_id || !add_unit_id) {
    return NextResponse.json({ error: 'league_id and add_unit_id required' }, { status: 400 });
  }

  // Get current max priority_rank for this user in this league
  const { data: existing } = await supabase
    .from('waiver_claims')
    .select('priority_rank')
    .eq('league_id', league_id)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('priority_rank', { ascending: false })
    .limit(1);

  const nextRank = existing && existing.length > 0
    ? existing[0].priority_rank + 1
    : 1;

  const { data, error } = await supabase
    .from('waiver_claims')
    .insert({
      league_id,
      user_id: user.id,
      add_unit_id,
      drop_unit_id: drop_unit_id || null,
      bid_amount,
      priority_rank: nextRank,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    console.error('Waiver claim error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, claim: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, priority_rank, status } = body;

  const { error } = await supabase
    .from('waiver_claims')
    .update({
      ...(priority_rank !== undefined && { priority_rank }),
      ...(status !== undefined && { status })
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
