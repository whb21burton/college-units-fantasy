import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const CURRENT_TERMS_VERSION = '2026-05-18';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const termsVersion = body.termsVersion ?? '1.0';
    const privacyVersion = body.privacyVersion ?? '1.0';
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
    const userAgent = req.headers.get('user-agent') ?? 'unknown';

    const admin = createAdminClient();

    const { error: upsertError } = await admin
      .from('user_terms_acceptance')
      .upsert({
        user_id: user.id,
        terms_version: termsVersion,
        privacy_version: privacyVersion,
        accepted_at: new Date().toISOString(),
        ip_address: ip,
        user_agent: userAgent,
      }, { onConflict: 'user_id,terms_version' });

    if (upsertError) {
      console.error('[accept-terms] upsert error:', upsertError.message, upsertError.code, upsertError.details);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Log compliance event (non-blocking)
    await admin.from('compliance_logs').insert({
      user_id: user.id,
      event_type: 'terms_accepted',
      event_data: { termsVersion, privacyVersion },
      ip_address: ip,
      user_agent: userAgent,
    }).then(({ error }) => {
      if (error) console.error('[accept-terms] log error:', error.message);
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[accept-terms] unhandled:', err?.message);
    return NextResponse.json({ error: 'Failed to save acceptance' }, { status: 500 });
  }
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
