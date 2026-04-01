/**
 * GET /api/public-leagues
 *
 * Returns all public leagues with status forming/drafting/active.
 * Always served with Cache-Control: no-store so the browser never serves
 * a stale 304 after a new league is created.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const admin = createAdminClient();

    const { data: leagues, error } = await admin
      .from('leagues')
      .select('id, name, buy_in, league_size, draft_type, league_type, week, status, invite_code, conference_filter, commissioner_id, created_at, draft_start_time')
      .eq('is_public', true)
      .in('status', ['forming', 'drafting', 'active'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[public-leagues] query error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[public-leagues] rows returned:', leagues?.length ?? 0);

    // Fetch member counts in parallel
    const counts = await Promise.all(
      (leagues ?? []).map(l =>
        admin
          .from('league_members')
          .select('*', { count: 'exact', head: true })
          .eq('league_id', l.id)
          .then(({ count }) => ({ id: l.id, count: count ?? 0 }))
      )
    );
    const cm: Record<string, number> = {};
    counts.forEach(c => { cm[c.id] = c.count; });

    const result = (leagues ?? []).map(l => ({
      ...l,
      conference_filter: l.conference_filter ?? 'ALL',
      member_count: cm[l.id] ?? 0,
    }));

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('[public-leagues] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
