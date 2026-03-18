import { NextRequest, NextResponse } from 'next/server';
import { syncScores } from '@/lib/sportsDataService';

export const dynamic = 'force-dynamic';

const CURRENT_SEASON = 2025;

/**
 * GET /api/cron/sync-scores
 *
 * Updates cached_scores for the current week's games.
 * Runs every 5 minutes via Vercel cron (see vercel.json).
 * Protected by CRON_SECRET env var.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    // Determine current week from query param or date heuristic
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get('week');
    const week = weekParam ? parseInt(weekParam, 10) : currentCfbWeek();

    const recordsUpdated = await syncScores(week, CURRENT_SEASON);
    const duration = Date.now() - start;

    return NextResponse.json({ success: true, week, season: CURRENT_SEASON, recordsUpdated, duration });
  } catch (err: any) {
    console.error('[cron/sync-scores]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * Estimate the current CFB week based on date.
 * CFB season starts first weekend of September (week 1 ~ Sept 1-7).
 */
function currentCfbWeek(): number {
  const now   = new Date();
  const year  = now.getFullYear();
  // Approximate: week 1 starts Sept 1 of the year
  const seasonStart = new Date(`${year}-09-01`);
  const diffMs = now.getTime() - seasonStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.max(1, Math.min(14, Math.floor(diffDays / 7) + 1));
  return week;
}
