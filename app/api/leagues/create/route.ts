import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';

export async function POST(req: NextRequest) {
  // Use the same auth pattern as all other routes in this project
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

  const { data, error: dbError } = await admin
    .from('leagues')
    .insert({
      name:            String(body.name ?? '').trim(),
      commissioner_id: user.id,
      buy_in:          body.buy_in ?? 0,
      league_size:     body.league_size ?? 8,
      draft_type:      body.draft_type ?? 'snake',
      salary_cap:      body.salary_cap ?? 200,
      is_public:       isPublic,
      league_type:     body.league_type ?? 'season',
      week:            body.week ?? null,
      invite_code:     '',
      status:          'forming',
    })
    .select('id, invite_code, name')
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: dbError?.message || 'Failed to create league' }, { status: 500 });
  }

  // Add commissioner as first member
  const { error: memberError } = await admin.from('league_members').insert({
    league_id:  data.id,
    user_id:    user.id,
    team_name:  String(body.team_name ?? '').trim() || 'My Team',
    draft_slot: 1,
  });

  if (memberError) {
    // Retry once
    const { error: retryError } = await admin.from('league_members').insert({
      league_id:  data.id,
      user_id:    user.id,
      team_name:  String(body.team_name ?? '').trim() || 'My Team',
      draft_slot: 1,
    });
    if (retryError) {
      return NextResponse.json(
        { error: 'League created but could not add you as a member.', ...data },
        { status: 207 },
      );
    }
  }

  return NextResponse.json(data);
}
