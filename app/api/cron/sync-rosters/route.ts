import { NextRequest, NextResponse } from 'next/server';
import { syncRosters } from '@/lib/sportsDataService';
import { createAdminClient } from '@/lib/supabase-server';
import { CONFERENCES } from '@/lib/playerPool';

export const dynamic = 'force-dynamic';

const CURRENT_SEASON = 2025;

/**
 * GET /api/cron/sync-rosters
 *
 * Syncs rosters for all teams in CONFERENCES into cached_players.
 * Runs once per day (4am UTC) via Vercel cron.
 * Protected by CRON_SECRET env var.
 * Skips if already ran today.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start     = Date.now();
  const jobName   = `syncRosters:${CURRENT_SEASON}`;
  const force     = request.nextUrl.searchParams.get('force') === '1';
  const yearParam = request.nextUrl.searchParams.get('year');
  const cfbdYear  = yearParam ? parseInt(yearParam, 10) : undefined;

  // Check if already ran today (skip if force=1)
  if (!force) {
    const admin      = createAdminClient();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: lastRun } = await admin
      .from('data_refresh_log')
      .select('ran_at')
      .eq('job_name', jobName)
      .eq('status', 'success')
      .gte('ran_at', todayStart.toISOString())
      .order('ran_at', { ascending: false })
      .limit(1)
      .single();

    if (lastRun) {
      return NextResponse.json({
        success:  true,
        skipped:  true,
        message:  `Already ran today at ${lastRun.ran_at}. Use ?force=1 to re-run.`,
        duration: Date.now() - start,
      });
    }
  }

  try {
    // Collect all unique team names from CONFERENCES
    const allTeams = Array.from(
      new Set(Object.values(CONFERENCES).flatMap(teams => teams)),
    );

    const recordsUpdated = await syncRosters(allTeams, CURRENT_SEASON, cfbdYear);
    const duration = Date.now() - start;

    return NextResponse.json({
      success: true, season: CURRENT_SEASON, teamsProcessed: allTeams.length, recordsUpdated, duration,
    });
  } catch (err: any) {
    console.error('[cron/sync-rosters]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
