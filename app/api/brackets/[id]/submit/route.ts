import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

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

  const admin = createAdminClient()

  // Verify contest
  const { data: contest, error: contestErr } = await admin
    .from('bracket_contests')
    .select('id, status')
    .eq('id', contestId)
    .single()

  if (contestErr || !contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  }

  if (contest.status !== 'open') {
    return NextResponse.json({ error: 'Contest is not open' }, { status: 403 })
  }

  // Get user's entry
  const { data: entry, error: entryErr } = await admin
    .from('user_bracket_entries')
    .select('id, is_submitted, is_locked')
    .eq('contest_id', contestId)
    .eq('user_id', user.id)
    .single()

  if (entryErr || !entry) {
    return NextResponse.json({ error: 'No entry found — make at least one pick first' }, { status: 404 })
  }

  if (entry.is_submitted || entry.is_locked) {
    return NextResponse.json({ error: 'Bracket already submitted' }, { status: 409 })
  }

  // Count picks vs seeded matchups
  const { count: picksCount } = await admin
    .from('user_bracket_picks')
    .select('id', { count: 'exact', head: true })
    .eq('entry_id', entry.id)

  const { count: seededMatchupCount } = await admin
    .from('tournament_matchups')
    .select('id', { count: 'exact', head: true })
    .eq('contest_id', contestId)
    .not('team1', 'is', null)
    .not('team2', 'is', null)

  if ((picksCount ?? 0) < (seededMatchupCount ?? 0)) {
    return NextResponse.json({
      error: `You have ${picksCount} picks but need ${seededMatchupCount}`,
    }, { status: 400 })
  }

  // Lock and submit the entry
  const { error: updateErr } = await admin
    .from('user_bracket_entries')
    .update({
      is_submitted: true,
      is_locked: true,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', entry.id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to submit bracket' }, { status: 500 })
  }

  // Increment entry_count on contest
  const { error: rpcErr } = await admin.rpc('increment_entry_count', { contest_id_input: contestId })
  if (rpcErr) {
    // Fallback if RPC doesn't exist
    await admin
      .from('bracket_contests')
      .update({ entry_count: (contest as any).entry_count + 1 })
      .eq('id', contestId)
  }

  return NextResponse.json({ success: true, entryId: entry.id })
}
