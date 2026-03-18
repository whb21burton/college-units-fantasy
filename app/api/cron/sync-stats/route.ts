import { NextRequest, NextResponse } from 'next/server';
import { syncStats, syncScores } from '@/lib/sportsDataService';

export const dynamic = 'force-dynamic';

const CURRENT_SEASON = 2025;

/**
 * GET /api/cron/sync-stats?week=N
 *
 * Syncs both scores AND full player/team stats for a given week into
 * cached_scores + cached_stats (including precomputed unit fantasy points).
 *
 * Run manually for backfill: call once per completed week.
 * Also runs after sync-scores detects newly completed games.
 * Protected by CRON_SECRET env var.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get('week');
  if (!weekParam) {
    return NextResponse.json({ error: 'week param required' }, { status: 400 });
  }

  const week  = parseInt(weekParam, 10);
  const start = Date.now();

  try {
    // Run scores + stats in sequence (stats depends on scores being current)
    const scoresUpdated = await syncScores(week, CURRENT_SEASON);
    const statsUpdated  = await syncStats(week, CURRENT_SEASON);
    const duration      = Date.now() - start;

    return NextResponse.json({
      success: true, week, season: CURRENT_SEASON,
      scoresUpdated, statsUpdated, duration,
    });
  } catch (err: any) {
    console.error(`[cron/sync-stats] week ${week}:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
