// GET /api/admin/espn-status?contestId=xxx
// Returns pending advancements + recent sync log + live game scores

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const contestId = searchParams.get('contestId')
  if (!contestId) return NextResponse.json({ error: 'contestId required' }, { status: 400 })

  const admin = createAdminClient()

  const [{ data: pending }, { data: syncLogs }, { data: matchups }] = await Promise.all([
    admin.from('pending_advancements')
      .select('*, tournament_matchups(espn_game_id, round_type, regional_name, home_team, away_team, home_score, away_score, game_status, inning_detail, winner)')
      .eq('contest_id', contestId)
      .eq('status', 'pending')
      .order('suggested_at', { ascending: false }),

    admin.from('espn_sync_log')
      .select('*')
      .eq('contest_id', contestId)
      .order('synced_at', { ascending: false })
      .limit(5),

    admin.from('tournament_matchups')
      .select('*')
      .eq('contest_id', contestId)
      .order('scheduled_start', { ascending: true }),
  ])

  return NextResponse.json({
    pendingAdvancements: pending   ?? [],
    recentSyncs:         syncLogs  ?? [],
    matchups:            matchups  ?? [],
  })
}
