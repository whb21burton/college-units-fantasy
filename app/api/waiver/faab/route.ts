import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET /api/waiver/faab?league_id=X — get user's remaining FAAB budget
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leagueId = new URL(req.url).searchParams.get('league_id');
  if (!leagueId) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('faab_balances')
    .select('remaining_budget')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If no row yet, return the league's starting budget as default
  if (!data) {
    const { data: league } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .single();
    const starting = league?.settings?.faab_budget ?? 100;
    return NextResponse.json({ balance: starting, starting });
  }

  return NextResponse.json({ balance: data.remaining_budget });
}

// PATCH /api/waiver/faab — commissioner edits a user's FAAB balance
// Body: { league_id, target_user_id, remaining_budget }
export async function PATCH(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { league_id, target_user_id, remaining_budget } = await req.json();
  if (!league_id || !target_user_id || remaining_budget === undefined) {
    return NextResponse.json({ error: 'league_id, target_user_id, remaining_budget required' }, { status: 400 });
  }

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', league_id)
    .single();
  if (league?.commissioner_id !== user.id) {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('faab_balances')
    .upsert({ league_id, user_id: target_user_id, remaining_budget, updated_at: new Date().toISOString() },
             { onConflict: 'league_id,user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
