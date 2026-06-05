import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';
const VALID_STATUSES = ['forming', 'active', 'live', 'scoring', 'completed', 'cancelled'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await createAdminClient()
      .from('users').select('email').eq('id', user.id).single();
    if (profile?.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { status } = await req.json();
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from('leagues')
      .update({ status })
      .eq('id', params.id);

    if (error) throw error;
    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    console.error('[league-status]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
