import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { regionalWinners, srWinners, omahaAWinner, omahaBWinner, champion, seriesResult } = await req.json()
  const admin = createAdminClient()

  const upserts: any[] = []

  for (const [region, winner] of Object.entries(regionalWinners as Record<string, string>)) {
    if (!winner) continue
    upserts.push({
      contest_id: 'global',
      round: 'regional',
      regional_name: region,
      matchup_index: 0,
      winner: { name: winner, id: winner.toLowerCase().replace(/\s+/g, '_') },
      game_status: 'final',
      updated_at: new Date().toISOString(),
    })
  }

  for (const [idx, winner] of Object.entries(srWinners as Record<string, string>)) {
    if (!winner) continue
    upserts.push({
      contest_id: 'global',
      round: 'super_regional',
      regional_name: null,
      matchup_index: parseInt(idx),
      winner: { name: winner, id: winner.toLowerCase().replace(/\s+/g, '_') },
      game_status: 'final',
      updated_at: new Date().toISOString(),
    })
  }

  if (omahaAWinner) upserts.push({
    contest_id: 'global', round: 'omaha_a', matchup_index: 0,
    winner: { name: omahaAWinner, id: omahaAWinner.toLowerCase().replace(/\s+/g, '_') },
    game_status: 'final', updated_at: new Date().toISOString(),
  })

  if (omahaBWinner) upserts.push({
    contest_id: 'global', round: 'omaha_b', matchup_index: 0,
    winner: { name: omahaBWinner, id: omahaBWinner.toLowerCase().replace(/\s+/g, '_') },
    game_status: 'final', updated_at: new Date().toISOString(),
  })

  if (champion) upserts.push({
    contest_id: 'global',
    round: 'national_championship',
    matchup_index: 0,
    winner: { name: champion, id: champion.toLowerCase().replace(/\s+/g, '_') },
    championship_series_result: seriesResult || null,
    game_status: 'final',
    updated_at: new Date().toISOString(),
  })

  if (upserts.length === 0) return NextResponse.json({ success: true, saved: 0 })

  const { error } = await admin
    .from('tournament_matchups')
    .upsert(upserts, { onConflict: 'contest_id,round,matchup_index' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, saved: upserts.length })
}
