// POST /api/leagues/join
// Body: { invite_code: string, team_name: string }

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { invite_code, team_name } = await req.json()
  if (!invite_code?.trim()) return NextResponse.json({ error: 'Invite code required' }, { status: 400 })
  if (!team_name?.trim()) return NextResponse.json({ error: 'Team name required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: league } = await admin
    .from('leagues')
    .select('*')
    .ilike('invite_code', invite_code.trim())
    .single()

  if (!league) return NextResponse.json({ error: 'Invalid invite code. League not found.' }, { status: 404 })
  if (league.status !== 'forming') return NextResponse.json({ error: 'This league has already started.' }, { status: 400 })

  const { data: existing } = await admin
    .from('league_members')
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return NextResponse.json({
    error: 'Already a member',
    league_id: league.id,
    redirect: `/league/${league.id}`,
  }, { status: 400 })

  const { count } = await admin
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', league.id)

  if (league.is_capped && (count ?? 0) >= league.league_size) {
    return NextResponse.json({ error: 'This league is full.' }, { status: 400 })
  }

  const buyInCents = Math.round((league.buy_in ?? 0) * 100)

  if (buyInCents > 0) {
    const { data: wallet } = await admin.from('wallets').select('id').eq('user_id', user.id).single()
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    const { data: accounts } = await admin.from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id)
    const availAcct   = accounts?.find(a => a.type === 'user_available')
    const pendingAcct = accounts?.find(a => a.type === 'user_pending')
    if (!availAcct) return NextResponse.json({ error: 'Ledger account not found' }, { status: 404 })

    const { data: entries } = await admin.from('ledger_entries').select('amount_cents').eq('ledger_account_id', availAcct.id)
    const balance = entries?.reduce((s, e) => s + Number(e.amount_cents), 0) ?? 0
    if (balance < buyInCents) {
      return NextResponse.json({
        error: 'Insufficient balance',
        code: 'INSUFFICIENT_BALANCE',
        required: buyInCents,
        balance,
      }, { status: 400 })
    }

    const { data: tx } = await admin.from('transactions').insert({
      user_id:          user.id,
      type:             'contest_entry',
      status:           'completed',
      amount_cents:     buyInCents,
      league_id:        league.id,
      idempotency_key:  `league_join_${league.id}_${user.id}`,
      description:      `Entry: ${league.name}`,
      completed_at:     new Date().toISOString(),
    }).select('id').single()

    if (tx) {
      await admin.from('ledger_entries').insert([
        { transaction_id: tx.id, ledger_account_id: availAcct.id,    amount_cents: -buyInCents },
        { transaction_id: tx.id, ledger_account_id: pendingAcct!.id, amount_cents:  buyInCents },
      ])
    }
  }

  await admin.from('league_members').insert({
    league_id: league.id,
    user_id:   user.id,
    team_name: team_name.trim(),
    paid:      buyInCents > 0,
  })

  if (league.league_type === 'bracket') {
    const contestId = (league.settings as any)?.bracket_contest_id
    if (contestId) {
      await admin.from('user_bracket_entries').upsert({
        contest_id:   contestId,
        user_id:      user.id,
        entry_name:   team_name.trim(),
        entry_number: 1,
        is_submitted: false,
      }, { onConflict: 'contest_id,user_id,entry_number' })
    }
  }

  const redirect = `/my-leagues?league=${league.id}`
  return NextResponse.json({ success: true, league_id: league.id, redirect })
}
