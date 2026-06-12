/**
 * POST /api/cron/advance-week
 *
 * Runs every Monday at 8AM (vercel.json: "0 8 * * 1").
 * 1. Reads current_week from platform_settings.
 * 2. If week >= 15, no-ops (season over).
 * 3. Increments current_week in platform_settings and in each active seasonal league.
 * 4. Posts a system chat message to each league announcing the new week.
 *
 * Auth: Bearer CRON_SECRET (Vercel) OR authenticated admin session (admin panel).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';
const MAX_WEEK    = 15;

export async function POST(request: NextRequest) {
  // Auth: Vercel cron secret OR admin session
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  try {
    // 1. Get current week
    const { data: weekRow } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'current_week')
      .single();
    const currentWeek = parseInt(weekRow?.value ?? '1', 10);

    // 2. Season over guard
    if (currentWeek >= MAX_WEEK) {
      return NextResponse.json({ success: true, message: 'Season complete — no advance needed', week: currentWeek });
    }

    const newWeek = currentWeek + 1;

    // 3. Advance platform_settings current_week
    await admin
      .from('platform_settings')
      .upsert({ key: 'current_week', value: String(newWeek), updated_at: new Date().toISOString() }, { onConflict: 'key' });

    // 4. Advance all active seasonal leagues + post chat announcements
    const { data: leagues } = await admin
      .from('leagues')
      .select('id, name, current_week')
      .eq('league_type', 'season')
      .eq('status', 'active');

    let leaguesUpdated = 0;
    for (const league of leagues ?? []) {
      // Update league's current_week
      await admin
        .from('leagues')
        .update({ current_week: newWeek })
        .eq('id', league.id);

      // Post system message to league chat (admin client bypasses RLS)
      await admin.from('league_messages').insert({
        league_id:    league.id,
        user_id:      null,
        display_name: 'CUF Bot',
        message:      `📅 Week ${newWeek} has begun! Set your lineup and check your matchup.`,
      });

      leaguesUpdated++;
    }

    return NextResponse.json({ success: true, advancedTo: newWeek, leaguesUpdated });
  } catch (err: any) {
    console.error('[cron/advance-week]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
