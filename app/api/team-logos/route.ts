/**
 * GET /api/team-logos
 * Returns { [school]: logoUrl } for all FBS teams.
 * Cached aggressively — logos rarely change.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.CFBD_API_KEY;
    if (!apiKey) throw new Error('CFBD_API_KEY not set');

    const url = 'https://apinext.collegefootballdata.com/teams?division=fbs';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`CFBD /teams HTTP ${res.status}`);

    const teams: any[] = await res.json();
    const map: Record<string, string> = {};
    for (const t of teams) {
      if (!t.school) continue;
      const logo = Array.isArray(t.logos) ? t.logos[0] : (t.logo ?? null);
      if (logo) map[t.school] = logo;
    }

    console.log(`[team-logos] loaded ${Object.keys(map).length} logos`);
    return NextResponse.json(map, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
    });
  } catch (err: any) {
    console.error('[team-logos]', err);
    return NextResponse.json({}, { status: 500 });
  }
}
