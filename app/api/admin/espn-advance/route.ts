// POST /api/admin/espn-advance
// Admin confirms or overrides a pending advancement
// Body: {
//   advancementId: string
//   action: 'confirm' | 'override' | 'dismiss'
//   overrideTeam?: object  // only for action='override'
//   seriesResult?: '2-0' | '2-1'  // only for national_championship
// }

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { advancementId, action, overrideTeam, seriesResult } = await req.json()
  if (!advancementId || !action) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const admin = createAdminClient()

  const { data: advancement } = await admin
    .from('pending_advancements')
    .select('*, tournament_matchups(*)')
    .eq('id', advancementId)
    .single()

  if (!advancement) return NextResponse.json({ error: 'Advancement not found' }, { status: 404 })

  if (action === 'dismiss') {
    await admin.from('pending_advancements').update({ status: 'dismissed' }).eq('id', advancementId)
    return NextResponse.json({ success: true, action: 'dismissed' })
  }

  const finalTeam = action === 'override' ? overrideTeam : advancement.advancing_team

  await admin.from('tournament_matchups').update({
    winner: finalTeam,
    ...(seriesResult ? { championship_series_result: seriesResult } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', advancement.matchup_id)

  await admin.from('pending_advancements').update({
    status:       action === 'override' ? 'overridden' : 'confirmed',
    confirmed_by: user.id,
    confirmed_at: new Date().toISOString(),
    ...(action === 'override' ? { override_team: overrideTeam, overridden: true } : {}),
  }).eq('id', advancementId)

  if (advancement.round_type === 'national_championship' && seriesResult) {
    await admin.from('bracket_contests')
      .update({ status: 'completed' })
      .eq('id', advancement.contest_id)
  }

  return NextResponse.json({ success: true, action, team: finalTeam, seriesResult })
}
