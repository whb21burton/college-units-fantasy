import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();

    const { data: league } = await admin
      .from('leagues')
      .select('created_by, name')
      .eq('id', params.id)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

    const isAdmin = user.email === ADMIN_EMAIL;
    console.log('[DELETE league] id:', params.id, 'user:', user.id, 'created_by:', league.created_by, 'isAdmin:', isAdmin);

    if (league.created_by !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete in dependency order
    await admin.from('draft_picks').delete().eq('league_id', params.id);
    await admin.from('league_members').delete().eq('league_id', params.id);
    const { error } = await admin.from('leagues').delete().eq('id', params.id);
    if (error) {
      console.error('[DELETE league] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.log('[DELETE league] success');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete-league]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to delete league' }, { status: 500 });
  }
}
