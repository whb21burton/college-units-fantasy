import { NextRequest, NextResponse } from 'next/server';
import { syncSchedule } from '@/lib/sportsDataService';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const CURRENT_SEASON = 2025;

/**
 * GET /api/cron/sync-schedule
 *
 * Syncs the full-season game schedule into cached_schedule.
 * Runs once per day (6am UTC) via Vercel cron.
 * Protected by CRON_SECRET env var.
 * Skips if already ran today to avoid redundant API calls.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start   = Date.now();
  const jobName = `syncSchedule:${CURRENT_SEASON}`;

  // Check if already ran today
  const admin     = createAdminClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: lastRun } = await admin
    .from('data_refresh_log')
    .select('ran_at, status')
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
      message:  `Already ran today at ${lastRun.ran_at}`,
      duration: Date.now() - start,
    });
  }

  try {
    const recordsUpdated = await syncSchedule(CURRENT_SEASON);
    const duration = Date.now() - start;

    return NextResponse.json({ success: true, season: CURRENT_SEASON, recordsUpdated, duration });
  } catch (err: any) {
    console.error('[cron/sync-schedule]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
