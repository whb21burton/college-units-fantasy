import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contestId, buyInCents, entryNumber = 1 } = await req.json()
  if (!contestId || !buyInCents) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const admin = createAdminClient()

  // Block duplicate payments — idempotency_key already encodes contestId + userId + entryNumber
  const { data: existing } = await admin
    .from('transactions')
    .select('id')
    .eq('idempotency_key', `bracket_entry_${contestId}_${user.id}_${entryNumber}`)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Already paid for this entry' }, { status: 400 })

  // Get wallet and ledger accounts
  const { data: wallet } = await admin.from('wallets').select('id').eq('user_id', user.id).single()
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

  const { data: accounts } = await admin.from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id)
  const availAcct   = accounts?.find(a => a.type === 'user_available')
  const pendingAcct = accounts?.find(a => a.type === 'user_pending')
  if (!availAcct || !pendingAcct) return NextResponse.json({ error: 'Ledger accounts not found' }, { status: 500 })

  // Compute available balance from ledger
  const { data: entries } = await admin.from('ledger_entries').select('amount_cents').eq('ledger_account_id', availAcct.id)
  const balance = entries?.reduce((sum, e) => sum + Number(e.amount_cents), 0) ?? 0
  if (balance < buyInCents) {
    return NextResponse.json({ error: 'Not enough funds' }, { status: 400 })
  }

  // Create transaction record
  const { data: tx } = await admin.from('transactions').insert({
    user_id:         user.id,
    type:            'contest_entry',
    status:          'completed',
    amount_cents:    buyInCents,
    idempotency_key: `bracket_entry_${contestId}_${user.id}_${entryNumber}`,
    description:     `Bracket entry #${entryNumber}: ${contestId}`,
    completed_at:    new Date().toISOString(),
  }).select('id').single()

  if (!tx) return NextResponse.json({ error: 'Transaction failed' }, { status: 500 })

  // Double-entry: debit available, credit pending
  await admin.from('ledger_entries').insert([
    { transaction_id: tx.id, ledger_account_id: availAcct.id,   amount_cents: -buyInCents },
    { transaction_id: tx.id, ledger_account_id: pendingAcct.id, amount_cents: +buyInCents },
  ])

  return NextResponse.json({ success: true })
}
