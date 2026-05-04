/**
 * GET /api/public-leagues
 * Returns all public weekly leagues with status forming/drafting/active.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('leagues')
    .select('id, name, buy_in, league_size, draft_type, league_type, week, status, invite_code, conference_filter, commissioner_id, created_at, is_capped, is_featured, max_entries_per_user, settings, is_public')
    .eq('is_public', true)
    .eq('league_type', 'weekly')
    .in('status', ['forming', 'drafting', 'active'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[public-leagues] query error:', error.message);
    return NextResponse.json([], { headers: NO_STORE });
  }

  const leagues = data ?? [];

  // Count members for each league
  const cm: Record<string, number> = {};
  try {
    const counts = await Promise.all(
      leagues.map(l =>
        admin
          .from('league_members')
          .select('*', { count: 'exact', head: true })
          .eq('league_id', l.id)
          .then(({ count }) => ({ id: l.id, count: count ?? 0 }))
      )
    );
    counts.forEach(c => { cm[c.id] = c.count; });
  } catch (err: any) {
    console.error('[public-leagues] member count error:', err?.message ?? err);
  }

  const result = leagues.map(l => ({
    ...l,
    // Preserve exact DB values — only default if truly null
    conference_filter: l.conference_filter ?? 'All D1',
    member_count:      cm[l.id] ?? 0,
  }));

  return NextResponse.json(result, { headers: NO_STORE });
}
