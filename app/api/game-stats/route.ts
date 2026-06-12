/**
 * GET /api/game-stats?week=N&season=YYYY
 *
 * Returns actual fantasy points scored for each school's units in a given week.
 * Reads from Supabase cache (cached_stats + cached_scores).
 * NEVER calls the CFBD API directly — data is populated by cron jobs.
 */
import { NextResponse } from 'next/server';
import { getUnitPointsForWeek, getCompletedSchoolsForWeek, getLiveSchoolsForWeek } from '@/lib/sportsDataReader';

export const dynamic = 'force-dynamic';

const SEASON = 2025;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const week   = parseInt(searchParams.get('week')   || '1',          10);
  const season = parseInt(searchParams.get('season') || String(SEASON), 10);

  try {
    const [{ schoolPoints, schoolMults }, completedSchools, liveSchools] = await Promise.all([
      getUnitPointsForWeek(week, season),
      getCompletedSchoolsForWeek(week, season),
      getLiveSchoolsForWeek(week, season),
    ]);

    return NextResponse.json(
      { week, season, completedSchools, liveSchools, schoolPoints, schoolMults },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    console.error('game-stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
