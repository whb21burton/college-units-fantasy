/**
 * GET /api/unit-stats?school=X&unitType=Y&season=2025
 *
 * Returns week-by-week game log stats for a school's fantasy unit.
 * Reads from Supabase cache (cached_stats + cached_schedule).
 * NEVER calls the CFBD API directly — data is populated by cron jobs.
 */
import { NextResponse } from 'next/server';
import { getSchoolWeekGameLog } from '@/lib/sportsDataReader';
import type { UnitType } from '@/lib/playerPool';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const school   = searchParams.get('school')   ?? '';
  const unitType = (searchParams.get('unitType') ?? '') as UnitType;
  const season   = parseInt(searchParams.get('season') || '2025', 10);

  if (!school || !unitType) {
    return NextResponse.json({ error: 'school and unitType required' }, { status: 400 });
  }

  try {
    const weeks = await getSchoolWeekGameLog(school, unitType, season);
    return NextResponse.json(
      { school, unitType, weeks, jerseyMap: {} },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    console.error('unit-stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
