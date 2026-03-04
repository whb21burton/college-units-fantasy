import { NextRequest, NextResponse } from 'next/server';
import { getGames } from 'cfbd';
import { createAdminClient } from '@/lib/supabase-server';
import { initCfbdClient } from '@/lib/cfbd-client';
import { CONFERENCES } from '@/lib/playerPool';

const ALL_SCHOOLS = new Set(Object.values(CONFERENCES).flat());

/**
 * GET /api/schedule?week=N&season=YYYY
 * Returns stored school matchup data for the given week.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const week   = parseInt(searchParams.get('week')   ?? '0', 10);
  const season = parseInt(searchParams.get('season') ?? '0', 10);

  if (!week || !season) {
    return NextResponse.json({ error: 'week and season query params are required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('school_matchups')
    .select('*')
    .eq('week', week)
    .eq('season', season)
    .order('home_school');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], week, season });
}

/**
 * POST /api/schedule
 * Body: { week: number, season: number }
 *
 * Fetches the CFBD schedule for the week, filters to games where both teams
 * are in the platform's school pool, and upserts into school_matchups.
 *
 * Protected: requires SUPABASE_SERVICE_ROLE_KEY.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { week?: number; season?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { week, season } = body;
  if (!week || !season) {
    return NextResponse.json({ error: 'week and season are required in body' }, { status: 400 });
  }

  try {
    initCfbdClient();

    const { data: games } = await getGames({ query: { year: season, week } });

    if (!games || games.length === 0) {
      return NextResponse.json({ message: 'No games found for this week', processed: 0 });
    }

    // Filter to games where both teams are in the platform pool
    const poolGames = games.filter(
      g => ALL_SCHOOLS.has(g.homeTeam) && ALL_SCHOOLS.has(g.awayTeam)
    );

    if (poolGames.length === 0) {
      return NextResponse.json({ message: 'No pool school matchups found for this week', processed: 0 });
    }

    const rows = poolGames.map(g => ({
      week,
      season,
      home_school:  g.homeTeam,
      away_school:  g.awayTeam,
      cfbd_game_id: g.id,
      start_time:   g.startDate,
      completed:    g.completed,
    }));

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('school_matchups')
      .upsert(rows, { onConflict: 'week,season,cfbd_game_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ message: 'Schedule synced', processed: poolGames.length, week, season });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
