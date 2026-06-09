import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';

async function requireAdmin() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return null;
  return user;
}

// GET /api/admin/compliance
// Returns restricted states + recent blocked compliance logs
export async function GET(_req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const [statesRes, logsRes] = await Promise.all([
    admin
      .from('restricted_states')
      .select('state_code, state_name, reason, active, created_at')
      .order('state_name'),
    admin
      .from('compliance_logs')
      .select('id, user_id, event_type, event_data, ip_address, created_at')
      .eq('event_type', 'blocked_entry')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    states: statesRes.data ?? [],
    logs:   logsRes.data  ?? [],
  });
}

// POST /api/admin/compliance
// Body: { action: 'upsert', state_code, state_name, reason?, active? }
//     | { action: 'toggle', state_code, active }
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  if (body.action === 'toggle') {
    const { state_code, active } = body;
    if (!state_code) return NextResponse.json({ error: 'state_code required' }, { status: 400 });
    const { error } = await admin
      .from('restricted_states')
      .update({ active: Boolean(active) })
      .eq('state_code', String(state_code).toUpperCase());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === 'upsert') {
    const { state_code, state_name, reason, active = true } = body;
    if (!state_code || !state_name) {
      return NextResponse.json({ error: 'state_code and state_name required' }, { status: 400 });
    }
    const { error } = await admin
      .from('restricted_states')
      .upsert({
        state_code: String(state_code).toUpperCase(),
        state_name: String(state_name),
        reason:     reason ? String(reason) : null,
        active:     Boolean(active),
      }, { onConflict: 'state_code' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === 'delete') {
    const { state_code } = body;
    if (!state_code) return NextResponse.json({ error: 'state_code required' }, { status: 400 });
    const { error } = await admin
      .from('restricted_states')
      .delete()
      .eq('state_code', String(state_code).toUpperCase());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
