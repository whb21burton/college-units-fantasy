import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { contestId, contestType } = await req.json()
  if (!contestId || !contestType) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const admin = createAdminClient()
  let refundCount = 0
  const errors: string[] = []

  if (contestType === 'bracket') {
    const { data: paidTxs } = await admin
      .from('transactions')
      .select('id, user_id, amount_cents')
      .eq('type', 'contest_entry')
      .eq('status', 'completed')
      .ilike('description', `%${contestId}%`)

    for (const tx of paidTxs ?? []) {
      const { error } = await admin.rpc('credit_wallet', {
        p_user_id:         tx.user_id,
        p_amount_cents:    tx.amount_cents,
        p_type:            'refund',
        p_description:     `Refund: bracket contest ${contestId} deleted by admin`,
        p_idempotency_key: `admin_refund_${contestId}_${tx.id}`,
      })
      if (error) errors.push(`Refund failed for tx ${tx.id}: ${error.message}`)
      else refundCount++
    }

    await admin.from('user_bracket_entries').delete().eq('contest_id', contestId)
    await admin.from('bracket_messages').delete().eq('contest_id', contestId)
    await admin.from('tournament_matchups').delete().eq('contest_id', contestId)
    await admin.from('pending_advancements').delete().eq('contest_id', contestId)
    await admin.from('bracket_contests').delete().eq('id', contestId)

  } else if (contestType === 'league') {
    const { data: paidTxs } = await admin
      .from('transactions')
      .select('id, user_id, amount_cents')
      .eq('type', 'contest_entry')
      .eq('status', 'completed')
      .eq('league_id', contestId)

    const { data: descTxs } = await admin
      .from('transactions')
      .select('id, user_id, amount_cents')
      .eq('type', 'contest_entry')
      .eq('status', 'completed')
      .ilike('description', `%${contestId}%`)

    const seen = new Set<string>()
    const uniqueTxs = [...(paidTxs ?? []), ...(descTxs ?? [])].filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })

    for (const tx of uniqueTxs) {
      const { error } = await admin.rpc('credit_wallet', {
        p_user_id:         tx.user_id,
        p_amount_cents:    tx.amount_cents,
        p_type:            'refund',
        p_description:     `Refund: league ${contestId} deleted by admin`,
        p_idempotency_key: `admin_refund_${contestId}_${tx.id}`,
      })
      if (error) errors.push(`Refund failed for tx ${tx.id}: ${error.message}`)
      else refundCount++
    }

    await admin.from('draft_picks').delete().eq('league_id', contestId)
    await admin.from('league_members').delete().eq('league_id', contestId)
    await admin.from('leagues').delete().eq('id', contestId)
  }

  return NextResponse.json({ success: true, refundCount, errors })
}
