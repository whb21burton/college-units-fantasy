import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: league } = await admin
      .from('leagues')
      .select('id, commissioner_id')
      .eq('id', params.id)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.commissioner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete in dependency order
    await admin.from('draft_picks').delete().eq('league_id', params.id);
    await admin.from('league_members').delete().eq('league_id', params.id);
    await admin.from('leagues').delete().eq('id', params.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete-league]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to delete league' }, { status: 500 });
  }
}
