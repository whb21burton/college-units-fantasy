import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import type { Team } from '@/lib/bracketTypes'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const contestId = params.id

  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { matchupId, pickedTeam, predictedSeries } = body as {
    matchupId: string
    pickedTeam: Team
    predictedSeries?: '2-0' | '2-1'
  }

  if (!matchupId || !pickedTeam) {
    return NextResponse.json({ error: 'Missing matchupId or pickedTeam' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify contest exists and is open
  const { data: contest, error: contestErr } = await admin
    .from('bracket_contests')
    .select('id, status')
    .eq('id', contestId)
    .single()

  if (contestErr || !contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  }

  if (contest.status !== 'open') {
    return NextResponse.json({ error: 'Contest is not open for picks' }, { status: 403 })
  }

  // Verify matchup belongs to this contest
  const { data: matchup, error: matchupErr } = await admin
    .from('tournament_matchups')
    .select('id, contest_id, team1, team2')
    .eq('id', matchupId)
    .eq('contest_id', contestId)
    .single()

  if (matchupErr || !matchup) {
    return NextResponse.json({ error: 'Matchup not found' }, { status: 404 })
  }

  // Verify the picked team is actually in this matchup
  const team1Id = matchup.team1?.id
  const team2Id = matchup.team2?.id
  if (pickedTeam.id !== team1Id && pickedTeam.id !== team2Id) {
    return NextResponse.json({ error: 'Picked team is not in this matchup' }, { status: 400 })
  }

  // Get or create user bracket entry
  const entryName = user.email?.split('@')[0] ?? 'My Bracket'
  const { data: existingEntry } = await admin
    .from('user_bracket_entries')
    .select('id')
    .eq('contest_id', contestId)
    .eq('user_id', user.id)
    .single()

  let entryId: string

  if (existingEntry) {
    entryId = existingEntry.id
  } else {
    const { data: newEntry, error: entryErr } = await admin
      .from('user_bracket_entries')
      .insert({
        contest_id: contestId,
        user_id: user.id,
        entry_name: entryName,
        total_score: 0,
        correct_picks: 0,
        is_submitted: false,
        is_locked: false,
      })
      .select('id')
      .single()

    if (entryErr || !newEntry) {
      return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    }
    entryId = newEntry.id
  }

  // Upsert the pick
  const { error: pickErr } = await admin
    .from('user_bracket_picks')
    .upsert(
      {
        entry_id: entryId,
        matchup_id: matchupId,
        picked_team: pickedTeam,
        predicted_series: predictedSeries ?? null,
        is_correct: null,
        points_earned: 0,
      },
      { onConflict: 'entry_id,matchup_id' }
    )

  if (pickErr) {
    return NextResponse.json({ error: 'Failed to save pick' }, { status: 500 })
  }

  return NextResponse.json({ success: true, entryId })
}
