import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { recalculateAllScores } from '@/lib/bracketScoring'

const ADMIN_EMAIL = 'whb21burton@gmail.com'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const contestId = params.id

  // Auth check
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await req.json()
  const { matchupId, winnerId, seriesResult } = body as {
    matchupId: string
    winnerId: string
    seriesResult: '2-0' | '2-1'
  }

  if (!matchupId || !winnerId || !seriesResult) {
    return NextResponse.json({ error: 'Missing matchupId, winnerId, or seriesResult' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch matchup to find winner team object
  const { data: matchup, error: matchupErr } = await admin
    .from('tournament_matchups')
    .select('id, contest_id, team1, team2')
    .eq('id', matchupId)
    .eq('contest_id', contestId)
    .single()

  if (matchupErr || !matchup) {
    return NextResponse.json({ error: 'Matchup not found' }, { status: 404 })
  }

  const winnerTeam =
    matchup.team1?.id === winnerId ? matchup.team1 :
    matchup.team2?.id === winnerId ? matchup.team2 :
    null

  if (!winnerTeam) {
    return NextResponse.json({ error: 'Winner ID does not match any team in this matchup' }, { status: 400 })
  }

  // Update the matchup
  const { error: updateErr } = await admin
    .from('tournament_matchups')
    .update({
      winner: winnerTeam,
      series_result: seriesResult,
      status: 'completed',
    })
    .eq('id', matchupId)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update matchup' }, { status: 500 })
  }

  // Recalculate all scores
  await recalculateAllScores(contestId, admin)

  // Count entries updated
  const { count: entriesUpdated } = await admin
    .from('user_bracket_entries')
    .select('id', { count: 'exact', head: true })
    .eq('contest_id', contestId)

  return NextResponse.json({ success: true, entriesUpdated: entriesUpdated ?? 0 })
}
