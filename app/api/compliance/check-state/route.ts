import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { state_code } = await req.json();
  if (!state_code || typeof state_code !== 'string' || state_code.length !== 2) {
    return NextResponse.json({ error: 'Valid 2-letter state code required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: restriction } = await admin
    .from('restricted_states')
    .select('state_name, reason')
    .eq('state_code', state_code.toUpperCase())
    .eq('active', true)
    .single();

  const eligible = !restriction;

  return NextResponse.json({
    eligible,
    state_code: state_code.toUpperCase(),
    state_name: restriction?.state_name ?? null,
    reason: restriction?.reason ?? null,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const state_code = searchParams.get('state');

  if (!state_code || state_code.length !== 2) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('restricted_states')
      .select('state_code, state_name, reason')
      .eq('active', true)
      .order('state_name');
    return NextResponse.json({ restricted_states: data ?? [] });
  }

  const admin = createAdminClient();
  const { data: restriction } = await admin
    .from('restricted_states')
    .select('state_name, reason')
    .eq('state_code', state_code.toUpperCase())
    .eq('active', true)
    .single();

  return NextResponse.json({
    eligible: !restriction,
    state_code: state_code.toUpperCase(),
    reason: restriction?.reason ?? null,
  });
}
