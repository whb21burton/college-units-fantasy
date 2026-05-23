import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // Server enforces admin-only public leagues — no client can bypass this
  const isAdmin = user.email === ADMIN_EMAIL;
  const isPublic = isAdmin ? (body.is_public ?? false) : false;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const baseName           = String(body.name ?? '').trim();
  const leagueSize         = Math.max(2, Math.min(10000, parseInt(body.league_size) || 8));
  const buyIn              = Math.max(0, Math.min(10000, parseFloat(body.buy_in) || 0));
  const copies             = Math.max(1, Math.min(20, parseInt(body.copies) || 1));
  const settings           = body.settings && typeof body.settings === 'object' ? body.settings : {};
  const maxEntriesPerUser  = body.max_entries_per_user != null
    ? Math.max(1, Math.min(100, parseInt(body.max_entries_per_user) || 1))
    : null;
  // is_capped: use explicit value from body if provided, otherwise derive from max_entries_per_user
  const isCapped = body.is_capped !== undefined ? Boolean(body.is_capped) : maxEntriesPerUser != null;

  const storedConferenceFilter = isPublic ? (body.conference_filter ?? 'All D1') : 'All D1';

  const created: { id: string; invite_code: string; name: string }[] = [];

  for (let i = 0; i < copies; i++) {
    const nameSuffix = copies > 1 ? ` ${String(i + 1).padStart(2, '0')}` : '';
    const leagueName = baseName + nameSuffix;

    const { data, error: dbError } = await admin
      .from('leagues')
      .insert({
        name:              leagueName,
        commissioner_id:   user.id,
        buy_in:            buyIn,
        league_size:       leagueSize,
        draft_type:        body.draft_type ?? 'snake',
        salary_cap:        body.salary_cap ?? 200,
        conference_filter: storedConferenceFilter,
        is_public:         isPublic,
        league_type:       body.league_type ?? 'season',
        week:              body.week ?? null,
        is_capped:              isCapped,
        max_entries_per_user:   maxEntriesPerUser,
        invite_code:            (body.invite_code?.trim().toUpperCase()) || generateInviteCode(),
        status:                 'forming',
        settings:               settings,
      })
      .select('id, invite_code, name')
      .single();

    if (dbError || !data) {
      if (created.length > 0) {
        // partial success — return what we created so far
        return NextResponse.json({
          leagues: created,
          error: `Created ${created.length}/${copies} leagues. Error on copy ${i + 1}: ${dbError?.message}`,
        });
      }
      return NextResponse.json({ error: dbError?.message || 'Failed to create league' }, { status: 500 });
    }

    // Public leagues: commissioner is NOT auto-joined.
    // Private leagues: commissioner is always member #1.
    if (!isPublic) {
      await admin.from('league_members').insert({
        league_id:  data.id,
        user_id:    user.id,
        team_name:  String(body.team_name ?? '').trim() || 'My Team',
        draft_slot: 1,
      });
    }

    // Bracket leagues always get their own dedicated contest — never share with other leagues
    if (body.league_type === 'bracket') {
      const { data: newContest } = await admin
        .from('bracket_contests')
        .insert({
          name:            data.name,
          sport:           settings?.bracket_sport ?? 'baseball',
          season:          new Date().getFullYear(),
          status:          'open',
          entry_fee_cents: Math.round(buyIn * 100),
          max_entries:     leagueSize === 999999 ? null : leagueSize,
          settings: {
            max_per_account:   maxEntriesPerUser ?? 1,
            payout_structure:  settings?.payout_structure ?? 'winner_take_all',
            league_id:         data.id,
          },
          created_by: user.id,
        })
        .select('id, name')
        .single()

      if (newContest) {
        await admin.from('leagues').update({
          settings: {
            ...settings,
            bracket_contest_id: newContest.id,
            bracket_name:       data.name,
            bracket_sport:      settings?.bracket_sport ?? 'baseball',
          }
        }).eq('id', data.id)
      }
    }

    created.push(data);
  }

  return NextResponse.json({ leagues: created });
}
