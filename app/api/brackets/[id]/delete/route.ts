import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const contestId = params.id
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Find all paid transactions for this contest
  const { data: paidTxs } = await admin
    .from('transactions')
    .select('id, user_id, amount_cents')
    .eq('type', 'contest_entry')
    .eq('status', 'completed')
    .ilike('description', `%${contestId}%`)

  // Refund each paid user via ledger
  let refundCount = 0
  for (const tx of paidTxs ?? []) {
    const { data: wallet } = await admin
      .from('wallets').select('id').eq('user_id', tx.user_id).single()
    if (!wallet) continue

    const { data: accounts } = await admin
      .from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id)
    const availAcct   = accounts?.find(a => a.type === 'user_available')
    const pendingAcct = accounts?.find(a => a.type === 'user_pending')
    if (!availAcct) continue

    const { data: refundTx } = await admin.from('transactions').insert({
      user_id:         tx.user_id,
      type:            'refund',
      status:          'completed',
      amount_cents:    tx.amount_cents,
      description:     `Refund: bracket contest ${contestId} deleted`,
      idempotency_key: `refund_delete_${contestId}_${tx.id}`,
      completed_at:    new Date().toISOString(),
    }).select('id').single()

    if (refundTx) {
      const ledgerInserts: any[] = [
        { transaction_id: refundTx.id, ledger_account_id: availAcct.id, amount_cents: +tx.amount_cents },
      ]
      if (pendingAcct) {
        ledgerInserts.push({ transaction_id: refundTx.id, ledger_account_id: pendingAcct.id, amount_cents: -tx.amount_cents })
      }
      await admin.from('ledger_entries').insert(ledgerInserts)
      refundCount++
    }
  }

  // Get entry IDs for cascade delete of picks
  const { data: entries } = await admin
    .from('user_bracket_entries').select('id').eq('contest_id', contestId)
  const entryIds = entries?.map(e => e.id) ?? []

  if (entryIds.length > 0) {
    await admin.from('user_bracket_picks').delete().in('entry_id', entryIds)
  }
  await admin.from('user_bracket_entries').delete().eq('contest_id', contestId)
  await admin.from('bracket_messages').delete().eq('contest_id', contestId)
  await admin.from('tournament_matchups').delete().eq('contest_id', contestId)
  await admin.from('bracket_contests').delete().eq('id', contestId)

  return NextResponse.json({ deleted: true, refunded: refundCount })
}
