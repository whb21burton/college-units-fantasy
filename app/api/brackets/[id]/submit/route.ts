import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const contestId = params.id
  const supabase  = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { picks } = body as { picks?: Record<string, any> }

  const admin = createAdminClient()

  const { data: contest } = await admin
    .from('bracket_contests').select('id, status, entry_count').eq('id', contestId).single()
  if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  if (contest.status !== 'open') return NextResponse.json({ error: 'Contest is not open' }, { status: 403 })

  // Upsert entry — create if needed, update bracket_data with picks
  const { data: existing } = await admin
    .from('user_bracket_entries').select('id, is_submitted, is_locked')
    .eq('contest_id', contestId).eq('user_id', user.id).single()

  if (existing?.is_submitted || existing?.is_locked) {
    return NextResponse.json({ error: 'Bracket already submitted' }, { status: 409 })
  }

  let entryId: string

  if (existing) {
    await admin.from('user_bracket_entries')
      .update({ bracket_data: { picks }, is_submitted: true, is_locked: true, submitted_at: new Date().toISOString() })
      .eq('id', existing.id)
    entryId = existing.id
  } else {
    const { data: created } = await admin.from('user_bracket_entries')
      .insert({
        contest_id: contestId,
        user_id: user.id,
        bracket_data: { picks },
        is_submitted: true,
        is_locked: true,
        submitted_at: new Date().toISOString(),
      })
      .select('id').single()
    if (!created) return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    entryId = created.id

    // Increment entry count
    await admin.from('bracket_contests')
      .update({ entry_count: (contest.entry_count ?? 0) + 1 })
      .eq('id', contestId)
  }

  return NextResponse.json({ success: true, entryId })
}
