/**
 * GET /api/game-stats?week=N&season=YYYY
 *
 * Returns actual fantasy points scored for each school's units in a given week.
 * Reads from Supabase cache (cached_stats + cached_scores).
 * NEVER calls the CFBD API directly — data is populated by cron jobs.
 */
import { NextResponse } from 'next/server';
import { getUnitPointsForWeek, getCompletedSchoolsForWeek } from '@/lib/sportsDataReader';

export const dynamic = 'force-dynamic';

const SEASON = 2025;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const week   = parseInt(searchParams.get('week')   || '1',          10);
  const season = parseInt(searchParams.get('season') || String(SEASON), 10);

  try {
    const [{ schoolPoints, schoolMults }, completedSchools] = await Promise.all([
      getUnitPointsForWeek(week, season),
      getCompletedSchoolsForWeek(week, season),
    ]);

    // ── DEBUG ─────────────────────────────────────────────────────────────────
    const ohioWR   = schoolPoints?.['Ohio State']?.['WR'];
    const ohioMult = schoolMults?.['Ohio State'];
    const totalSchools = Object.keys(schoolPoints ?? {}).length;
    console.log(`[game-stats] week=${week} season=${season} | total schools in schoolPoints: ${totalSchools}`);
    console.log(`[game-stats] schoolPoints['Ohio State']['WR'] = ${ohioWR ?? 'UNDEFINED'}`);
    console.log(`[game-stats] schoolMults['Ohio State']        = ${ohioMult ?? 'UNDEFINED'}`);
    console.log(`[game-stats] Ohio State in completedSchools:  ${completedSchools.includes('Ohio State')}`);
    console.log(`[game-stats] all Ohio State entries:`, JSON.stringify(schoolPoints?.['Ohio State'] ?? {}));
    // ── END DEBUG ─────────────────────────────────────────────────────────────

    return NextResponse.json(
      { week, season, completedSchools, schoolPoints, schoolMults },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    console.error('game-stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
