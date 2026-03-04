import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { calculateEfficiencyForWeek } from '@/lib/efficiency';

/**
 * GET /api/efficiency?week=N&season=YYYY
 * Returns stored efficiency data for all schools for the given week.
 * Falls back to the latest stored week if the requested week has no data.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const week   = parseInt(searchParams.get('week')   ?? '0', 10);
  const season = parseInt(searchParams.get('season') ?? '0', 10);

  if (!week || !season) {
    return NextResponse.json({ error: 'week and season query params are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Try exact week first; fall back to latest available week if not found
  let { data, error } = await supabase
    .from('team_efficiency')
    .select('*')
    .eq('season', season)
    .eq('week', week)
    .order('school');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data || data.length === 0) {
    // Fall back to the latest stored week for this season
    const { data: latest, error: latestError } = await supabase
      .from('team_efficiency')
      .select('*')
      .eq('season', season)
      .order('week', { ascending: false })
      .order('school')
      .limit(1000);

    if (latestError) return NextResponse.json({ error: latestError.message }, { status: 500 });
    data = latest ?? [];
  }

  return NextResponse.json({ data, week, season });
}

/**
 * POST /api/efficiency
 * Body: { week: number, season: number }
 *
 * Fetches CFBD season stats, computes efficiency percentiles for all pool schools,
 * and upserts into team_efficiency. Rows are NOT updated after kickoff to preserve
 * historical immutability — this route skips schools already stored for this week.
 *
 * Protected: requires SUPABASE_SERVICE_ROLE_KEY (server-to-server only).
 * In production, call this from a weekly cron job or admin trigger.
 */
export async function POST(req: NextRequest) {
  // Simple secret check — real auth would use a signed JWT or cron secret
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
    const results = await calculateEfficiencyForWeek(season, week);

    if (results.length === 0) {
      return NextResponse.json({ message: 'No CFBD data available yet for this week', processed: 0 });
    }

    const supabase = createAdminClient();

    // Check which schools already have locked data for this week
    const { data: existing } = await supabase
      .from('team_efficiency')
      .select('school')
      .eq('week', week)
      .eq('season', season);

    const alreadyStored = new Set((existing ?? []).map(r => r.school));
    const toInsert = results.filter(r => !alreadyStored.has(r.school));

    if (toInsert.length === 0) {
      return NextResponse.json({ message: 'All schools already locked for this week', processed: 0 });
    }

    const rows = toInsert.map(r => ({
      school:               r.school,
      conference:           r.conference,
      week,
      season,
      off_points_per_drive: r.offPointsPerDrive,
      off_yards_per_play:   r.offYardsPerPlay,
      off_success_rate:     r.offSuccessRate,
      off_turnover_rate:    r.offTurnoverRate,
      off_composite:        r.offComposite,
      off_percentile:       r.offPercentile,
      def_points_per_drive: r.defPointsPerDrive,
      def_yards_per_play:   r.defYardsPerPlay,
      def_success_rate:     r.defSuccessRate,
      def_turnover_rate:    r.defTurnoverRate,
      def_composite:        r.defComposite,
      def_percentile:       r.defPercentile,
      off_multiplier:       r.offMultiplier,
      def_multiplier:       r.defMultiplier,
    }));

    const { error: insertError } = await supabase
      .from('team_efficiency')
      .insert(rows);

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({ message: 'Efficiency calculated and stored', processed: toInsert.length, week, season });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
