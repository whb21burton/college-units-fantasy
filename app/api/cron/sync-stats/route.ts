import { NextRequest, NextResponse } from 'next/server';
import { syncStats, syncScores } from '@/lib/sportsDataService';
import { CONFERENCES } from '@/lib/playerPool';

export const dynamic = 'force-dynamic';

const CURRENT_SEASON = 2025;

// All P4 + Independent schools derived from CONFERENCES constant
const ALL_SCHOOLS = Object.values(CONFERENCES).flat();

/**
 * GET /api/cron/sync-stats?week=N
 *   Full sync — returns list of schools instead of processing all (use batches instead)
 *
 * GET /api/cron/sync-stats?week=N&school=Alabama
 *   Sync a single school only
 *
 * GET /api/cron/sync-stats?week=N&batch=0&batchSize=10
 *   Sync schools[0..9]; batch=1 → schools[10..19]; etc.
 *   batchSize defaults to 10.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekParam     = searchParams.get('week');
  const schoolParam   = searchParams.get('school');
  const batchParam    = searchParams.get('batch');
  const batchSizeParam = searchParams.get('batchSize');

  if (!weekParam) {
    return NextResponse.json({ error: 'week param required' }, { status: 400 });
  }

  const week = parseInt(weekParam, 10);
  const start = Date.now();

  try {
    // ── Single school ──────────────────────────────────────────────────────
    if (schoolParam) {
      const statsUpdated = await syncStats(week, CURRENT_SEASON, [schoolParam]);
      return NextResponse.json({
        success: true, week, season: CURRENT_SEASON, school: schoolParam,
        statsUpdated, duration: Date.now() - start,
      });
    }

    // ── Batch mode ────────────────────────────────────────────────────────
    if (batchParam !== null) {
      const batchSize  = batchSizeParam ? parseInt(batchSizeParam, 10) : 10;
      const batchIndex = parseInt(batchParam, 10);
      const schoolsBatch = ALL_SCHOOLS.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

      if (schoolsBatch.length === 0) {
        return NextResponse.json({
          success: true, week, batch: batchIndex, schools: [], statsUpdated: 0,
          message: 'No schools in this batch', duration: Date.now() - start,
        });
      }

      // Only sync scores on batch 0 (once per week is enough)
      let scoresUpdated = 0;
      if (batchIndex === 0) {
        scoresUpdated = await syncScores(week, CURRENT_SEASON);
      }

      const statsUpdated = await syncStats(week, CURRENT_SEASON, schoolsBatch);
      return NextResponse.json({
        success: true, week, season: CURRENT_SEASON,
        batch: batchIndex, batchSize, schools: schoolsBatch,
        scoresUpdated, statsUpdated, duration: Date.now() - start,
      });
    }

    // ── No filter — return school list so caller can batch ────────────────
    const totalBatches = Math.ceil(ALL_SCHOOLS.length / 10);
    return NextResponse.json({
      message: 'Pass batch=N&batchSize=10 to process in chunks, or school=X for one school.',
      totalSchools: ALL_SCHOOLS.length,
      totalBatches,
      schools: ALL_SCHOOLS,
      example: `/api/cron/sync-stats?week=${week}&batch=0&batchSize=10`,
    });
  } catch (err: any) {
    console.error(`[cron/sync-stats] week=${week}:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
