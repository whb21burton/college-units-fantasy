import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies, headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dateOfBirth } = await req.json();
  if (!dateOfBirth) return NextResponse.json({ error: 'Date of birth required' }, { status: 400 });

  const dobDate = new Date(dateOfBirth);
  if (isNaN(dobDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const monthDiff = today.getMonth() - dobDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
    age--;
  }

  if (age < 18) {
    return NextResponse.json({ eligible: false, reason: 'Must be 18 or older to participate in paid contests.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const headersList = headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const verified = true;
  const { error } = await admin.from('user_verifications').upsert({
    user_id: user.id,
    date_of_birth: dateOfBirth,
    is_age_verified: verified,
    age_verified_at: verified ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) {
    console.error('[verify-age] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from('compliance_logs').insert({
    user_id: user.id,
    action: 'age_verified',
    details: { age, dateOfBirth },
    ip_address: ip,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ eligible: true, age });
}

export async function GET(_req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ verified: false });

  const admin = createAdminClient();
  const { data } = await admin
    .from('user_verifications')
    .select('is_age_verified, age_verified_at')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    verified: data?.is_age_verified === true,
    verified_at: data?.age_verified_at ?? null,
  });
}
