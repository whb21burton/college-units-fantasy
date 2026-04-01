/**
 * GET /api/public-leagues
 *
 * Returns all public leagues with status forming/drafting/active.
 * Always served with Cache-Control: no-store so the browser never serves
 * a stale 304 after a new league is created.
 *
 * Falls back to a simpler query if columns like is_public, league_type,
 * or conference_filter don't exist yet in the schema.
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

  // ── Primary query: full column set with is_public filter ──────────────────
  let leagues: any[] | null = null;
  let primaryOk = false;

  try {
    const { data, error } = await admin
      .from('leagues')
      .select('id, name, buy_in, league_size, draft_type, league_type, week, status, invite_code, conference_filter, commissioner_id, created_at, draft_start_time, is_capped, is_featured')
      .eq('is_public', true)
      .eq('league_type', 'weekly')
      .in('status', ['forming', 'drafting', 'active'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[public-leagues] primary query error (full):', error.message, error.code, error.details);
    } else {
      leagues = data ?? [];
      primaryOk = true;
      console.log('[public-leagues] primary query ok, rows:', leagues.length);
    }
  } catch (err: any) {
    console.error('[public-leagues] primary query threw:', err?.message ?? err);
  }

  // ── Fallback: minimal query if columns missing ────────────────────────────
  if (!primaryOk) {
    try {
      const { data, error } = await admin
        .from('leagues')
        .select('id, name, buy_in, league_size, draft_type, status, invite_code, commissioner_id, created_at')
        .eq('league_type', 'weekly')
        .in('status', ['forming', 'drafting', 'active'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[public-leagues] fallback query error:', error.message, error.code, error.details);
        // Return empty array — never 500 to the client
        return NextResponse.json([], { headers: NO_STORE });
      }

      leagues = data ?? [];
      console.log('[public-leagues] fallback query ok, rows:', leagues.length);
    } catch (err: any) {
      console.error('[public-leagues] fallback query threw:', err?.message ?? err);
      return NextResponse.json([], { headers: NO_STORE });
    }
  }

  // ── Member counts ─────────────────────────────────────────────────────────
  let cm: Record<string, number> = {};
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
    // Non-fatal — member_count will just be 0
  }

  const result = leagues.map(l => ({
    ...l,
    conference_filter: l.conference_filter ?? 'ALL',
    league_type:       l.league_type ?? 'season',
    member_count:      cm[l.id] ?? 0,
  }));

  return NextResponse.json(result, { headers: NO_STORE });
}
