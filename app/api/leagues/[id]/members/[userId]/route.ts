import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** PATCH /api/leagues/[id]/members/[userId]
 *  Updates the calling user's own league_members row (team_name, team_logo_url).
 *  Only the member themselves can update their own record.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.id !== params.userId) {
      return NextResponse.json({ error: 'Can only update your own team' }, { status: 403 });
    }

    const body = await req.json();
    const { team_name, team_logo_url } = body as { team_name?: string; team_logo_url?: string | null };

    if (team_name !== undefined && (!team_name || team_name.trim().length === 0)) {
      return NextResponse.json({ error: 'Team name cannot be empty' }, { status: 400 });
    }

    const update: Record<string, any> = {};
    if (team_name !== undefined) update.team_name = team_name.trim();
    if (team_logo_url !== undefined) update.team_logo_url = team_logo_url;

    const admin = createAdminClient();
    const { error } = await admin
      .from('league_members')
      .update(update)
      .eq('league_id', params.id)
      .eq('user_id', params.userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[members/patch]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to update member' }, { status: 500 });
  }
}
