/**
 * GET /api/team-logos
 * Returns { [school]: logoUrl } for all FBS teams.
 * Cached aggressively — logos rarely change.
 */
import { NextResponse } from 'next/server';
import { initCfbdClient } from '@/lib/cfbd-client';

export const dynamic = 'force-dynamic';

const pkg = require('cfbd');
const { getTeams } = pkg;

export async function GET() {
  try {
    initCfbdClient();
    const res = await getTeams({ query: { division: 'fbs' } });
    const teams: any[] = res.data ?? res ?? [];

    const map: Record<string, string> = {};
    for (const t of teams) {
      if (!t.school) continue;
      const logo = Array.isArray(t.logos) ? t.logos[0] : t.logo ?? null;
      if (logo) map[t.school] = logo;
    }

    return NextResponse.json(map, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
    });
  } catch (err: any) {
    console.error('[team-logos]', err);
    return NextResponse.json({}, { status: 500 });
  }
}
