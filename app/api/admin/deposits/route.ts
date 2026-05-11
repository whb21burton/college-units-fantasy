import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ADMIN_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID;

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();

  const { data: deposits, error } = await admin
    .from('deposits')
    .select('*, auth_users:user_id(email)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    deposits: (deposits ?? []).map((d: any) => ({
      ...d,
      email: d.auth_users?.email ?? d.user_id,
    })),
  });
}
