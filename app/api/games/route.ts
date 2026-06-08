import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const week   = searchParams.get('week');
  const season = searchParams.get('season') ?? '2025';
  const admin  = createAdminClient();

  let query = admin
    .from('cached_schedule')
    .select('home_team, away_team, game_date, week')
    .eq('season', parseInt(season));

  if (week) query = query.eq('week', parseInt(week));

  const { data } = await query;
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
}
