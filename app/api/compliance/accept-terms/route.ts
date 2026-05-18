import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies, headers } from 'next/headers';

export const dynamic = 'force-dynamic';

const CURRENT_TERMS_VERSION = '2026-05-18';

export async function POST(_req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const headersList = headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const { error } = await admin.from('user_terms_acceptance').upsert({
    user_id: user.id,
    terms_version: CURRENT_TERMS_VERSION,
    accepted_at: new Date().toISOString(),
    ip_address: ip,
  }, { onConflict: 'user_id' });

  if (error) {
    console.error('[accept-terms] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from('compliance_logs').insert({
    user_id: user.id,
    action: 'terms_accepted',
    details: { terms_version: CURRENT_TERMS_VERSION },
    ip_address: ip,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, terms_version: CURRENT_TERMS_VERSION });
}

export async function GET(_req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ accepted: false });

  const admin = createAdminClient();
  const { data } = await admin
    .from('user_terms_acceptance')
    .select('terms_version, accepted_at')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    accepted: !!data && data.terms_version === CURRENT_TERMS_VERSION,
    terms_version: data?.terms_version ?? null,
    accepted_at: data?.accepted_at ?? null,
    current_version: CURRENT_TERMS_VERSION,
  });
}
