import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json()
  const { contestType, contestId, simulateResults } = body
  let numBots: number = body.numBots
  const admin = createAdminClient()

  // Get contest details
  let entryFeeCents = 0
  let payoutStructure = 'winner_take_all'
  let contestName = ''

  if (contestType === 'weekly') {
    const { data: league } = await admin
      .from('leagues')
      .select('buy_in, name, settings, league_size, is_capped, max_entries_per_user')
      .eq('id', contestId)
      .single()

    entryFeeCents = Math.round((league?.buy_in ?? 0) * 100)
    const settings = league?.settings as any
    payoutStructure = settings?.payout_structure ?? 'winner_take_all'
    contestName = league?.name ?? 'Weekly Contest'
    console.log('[simulate] league settings:', JSON.stringify(settings))
    console.log('[simulate] payoutStructure:', payoutStructure)

    // ── MAX ENTRIES CHECK ──────────────────────────────────
    const maxAllowed = league?.league_size ?? 999999
    const isCapped = league?.is_capped ?? false

    if (isCapped && maxAllowed < 999999) {
      const { count: currentCount } = await admin
        .from('league_members')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', contestId)

      const spotsRemaining = maxAllowed - (currentCount ?? 0)

      if (spotsRemaining <= 0) {
        return NextResponse.json({
          error: `Contest is full — ${maxAllowed}/${maxAllowed} entries filled`,
          botsCreated: 0,
        }, { status: 400 })
      }

      if (numBots > spotsRemaining) {
        console.log(`[simulate] capping bots from ${numBots} to ${spotsRemaining} (contest max: ${maxAllowed})`)
        numBots = spotsRemaining
      }
    }
  } else {
    const { data: contest } = await admin
      .from('bracket_contests')
      .select('entry_fee_cents, name, settings, max_entries, entry_count')
      .eq('id', contestId)
      .single()

    entryFeeCents = contest?.entry_fee_cents ?? 0
    payoutStructure = contest?.settings?.payout_structure ?? 'winner_take_all'
    contestName = contest?.name ?? 'Bracket Contest'

    // Cap bots to remaining spots
    if (contest?.max_entries) {
      const spotsRemaining = contest.max_entries - (contest.entry_count ?? 0)
      if (spotsRemaining <= 0) {
        return NextResponse.json({
          error: `Bracket contest is full — ${contest.max_entries}/${contest.max_entries} entries`,
          botsCreated: 0,
        }, { status: 400 })
      }
      if (numBots > spotsRemaining) {
        console.log(`[simulate] capping bots from ${numBots} to ${spotsRemaining}`)
        numBots = spotsRemaining
      }
    }
  }

  const botUsers: {
    id: string
    email: string
    walletId: string
    availAcctId: string
    pendingAcctId: string
    entryTxId: string | undefined
    isReal?: boolean
  }[] = []
  const errors: string[] = []

  // Create bot users and enter contest
  for (let i = 0; i < numBots; i++) {
    const email = `bot_${Date.now()}_${i}@simulate.cuf.internal`
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: 'SimBot123!',
      email_confirm: true,
      user_metadata: { display_name: `Bot ${i + 1}`, is_bot: true },
    })
    if (createErr || !newUser.user) {
      errors.push(`Bot ${i} create failed: ${createErr?.message}`)
      continue
    }

    const botId = newUser.user.id

    // Wait for create_wallet_for_new_user trigger to fire
    await new Promise(resolve => setTimeout(resolve, 500))

    // Fetch wallet created by trigger, or create via upsert if trigger didn't run
    let { data: wallet } = await admin.from('wallets').select('id').eq('user_id', botId).single()
    if (!wallet) {
      const { data: upserted, error: walletError } = await admin
        .from('wallets')
        .upsert({ user_id: botId }, { onConflict: 'user_id' })
        .select('id')
        .single()
      if (walletError) { errors.push(`Wallet error bot ${i}: ${walletError.message} (code: ${walletError.code})`); continue }
      wallet = upserted
    }
    if (!wallet) { errors.push(`Wallet failed for bot ${i}: could not create or find wallet`); continue }

    // Fetch ledger accounts created by trigger, or upsert if missing
    let { data: accounts } = await admin.from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id)
    if (!accounts || accounts.length < 2) {
      const { data: newAccounts } = await admin
        .from('ledger_accounts')
        .upsert([
          { name: `user_available_${botId}`, type: 'user_available', wallet_id: wallet.id, description: 'Bot available balance' },
          { name: `user_pending_${botId}`,   type: 'user_pending',   wallet_id: wallet.id, description: 'Bot pending balance'   },
        ], { onConflict: 'name' })
        .select('id, type')
      accounts = newAccounts
    }

    const availAcct   = accounts?.find(a => a.type === 'user_available')
    const pendingAcct = accounts?.find(a => a.type === 'user_pending')
    if (!availAcct || !pendingAcct) { errors.push(`Ledger accounts failed for bot ${i}`); continue }

    // Credit fake entry fee money
    if (entryFeeCents > 0) {
      const { data: depositTx } = await admin.from('transactions').insert({
        user_id: botId,
        type: 'deposit',
        status: 'completed',
        amount_cents: entryFeeCents,
        idempotency_key: `sim_deposit_${botId}_${contestId}`,
        description: 'Simulation deposit',
        completed_at: new Date().toISOString(),
      }).select('id').single()

      if (depositTx) {
        await admin.from('ledger_entries').insert([
          { transaction_id: depositTx.id, ledger_account_id: availAcct.id, amount_cents: entryFeeCents },
        ])
      }
    }

    // Contest entry transaction
    const { data: entryTx } = await admin.from('transactions').insert({
      user_id: botId,
      type: 'contest_entry',
      status: 'completed',
      amount_cents: entryFeeCents,
      league_id: contestType === 'weekly' ? contestId : null,
      idempotency_key: `sim_entry_${botId}_${contestId}`,
      description: `Entry: ${contestName}`,
      completed_at: new Date().toISOString(),
    }).select('id').single()

    if (entryTx && entryFeeCents > 0) {
      await admin.from('ledger_entries').insert([
        { transaction_id: entryTx.id, ledger_account_id: availAcct.id,   amount_cents: -entryFeeCents },
        { transaction_id: entryTx.id, ledger_account_id: pendingAcct.id, amount_cents: entryFeeCents  },
      ])
    }

    if (contestType === 'weekly') {
      await admin.from('league_members').insert({
        league_id: contestId,
        user_id: botId,
        team_name: `Bot Team ${i + 1}`,
        is_bot: true,
      })
    }

    botUsers.push({
      id: botId,
      email,
      walletId: wallet.id,
      availAcctId: availAcct.id,
      pendingAcctId: pendingAcct.id,
      entryTxId: entryTx?.id,
    })
  }

  // Build allEntrants: bots + real users already in the contest
  let allEntrants = [...botUsers]

  if (contestType === 'bracket') {
    const botIds = botUsers.map(b => b.id)
    const { data: existingEntries } = await admin
      .from('user_bracket_entries')
      .select('user_id, entry_name')
      .eq('contest_id', contestId)
      .not('user_id', 'in', `(${botIds.map(id => `'${id}'`).join(',')})`)

    for (const entry of existingEntries ?? []) {
      const { data: wallet } = await admin.from('wallets').select('id').eq('user_id', entry.user_id).single()
      if (!wallet) continue
      const { data: accounts } = await admin.from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id)
      const availAcct   = accounts?.find((a: any) => a.type === 'user_available')
      const pendingAcct = accounts?.find((a: any) => a.type === 'user_pending')
      if (!availAcct || !pendingAcct) continue
      allEntrants.push({ id: entry.user_id, email: entry.entry_name ?? entry.user_id, walletId: wallet.id, availAcctId: availAcct.id, pendingAcctId: pendingAcct.id, entryTxId: undefined, isReal: true })
    }
  } else if (contestType === 'weekly') {
    const { data: existingMembers } = await admin
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', contestId)
      .eq('is_bot', false)

    for (const member of existingMembers ?? []) {
      if (botUsers.find(b => b.id === member.user_id)) continue
      const { data: wallet } = await admin.from('wallets').select('id').eq('user_id', member.user_id).single()
      if (!wallet) continue
      const { data: accounts } = await admin.from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id)
      const availAcct   = accounts?.find((a: any) => a.type === 'user_available')
      const pendingAcct = accounts?.find((a: any) => a.type === 'user_pending')
      if (!availAcct || !pendingAcct) continue
      allEntrants.push({ id: member.user_id, email: member.team_name ?? member.user_id, walletId: wallet.id, availAcctId: availAcct.id, pendingAcctId: pendingAcct.id, entryTxId: undefined, isReal: true })
    }
  }

  const payouts: { rank: number; botEmail: string; isReal: boolean; payoutCents: number; payoutDollars: string }[] = []

  if (simulateResults && allEntrants.length > 0) {
    // Shuffle for random rankings
    const ranked = [...allEntrants].sort(() => Math.random() - 0.5)

    const totalPool = entryFeeCents * ranked.length
    const netPool   = Math.floor(totalPool * 0.95)
    const rake      = totalPool - netPool

    const isDoubleUp = payoutStructure === 'double_up'
    const doubleUpWinners = isDoubleUp ? Math.floor(ranked.length / 2) : 0
    const doubleUpPayoutCents = isDoubleUp ? Math.floor(entryFeeCents * 1.95) : 0

    const splits =
      payoutStructure === 'top3' ? [{ rank: 1, pct: 0.60 }, { rank: 2, pct: 0.25 }, { rank: 3, pct: 0.15 }] :
      payoutStructure === 'top2' ? [{ rank: 1, pct: 0.70 }, { rank: 2, pct: 0.30 }] :
                                   [{ rank: 1, pct: 1.00 }]

    // Build winner map: rank → bot
    const winnerMap = new Map<number, typeof ranked[number]>()
    if (isDoubleUp) {
      ranked.slice(0, doubleUpWinners).forEach((bot, idx) => winnerMap.set(idx + 1, bot))
    } else {
      for (const split of splits) {
        const winner = ranked[split.rank - 1]
        if (winner) winnerMap.set(split.rank, winner)
      }
    }

    // Pay out winners
    for (const rank of Array.from(winnerMap.keys())) {
      const winner = winnerMap.get(rank)!
      const payoutCents = isDoubleUp
        ? doubleUpPayoutCents
        : Math.floor(netPool * splits.find(s => s.rank === rank)!.pct)

      const { data: payoutTx } = await admin.from('transactions').insert({
        user_id: winner.id,
        type: 'contest_settlement',
        status: 'completed',
        amount_cents: payoutCents,
        league_id: contestType === 'weekly' ? contestId : null,
        idempotency_key: `sim_payout_${winner.id}_${contestId}_rank${rank}`,
        description: `Simulation payout - Rank #${rank}: ${contestName}`,
        completed_at: new Date().toISOString(),
      }).select('id').single()

      if (payoutTx && entryFeeCents > 0) {
        await admin.from('ledger_entries').insert([
          { transaction_id: payoutTx.id, ledger_account_id: winner.pendingAcctId, amount_cents: -entryFeeCents },
          { transaction_id: payoutTx.id, ledger_account_id: winner.availAcctId,   amount_cents: payoutCents   },
        ])
      }

      payouts.push({ rank, botEmail: winner.email, isReal: winner.isReal ?? false, payoutCents, payoutDollars: (payoutCents / 100).toFixed(2) })
    }

    const winnerIds = new Set(Array.from(winnerMap.values()).map(w => w.id))

    // Settle losers — debit pending (funds go to rake)
    for (const loser of ranked.filter(b => !winnerIds.has(b.id))) {
      if (entryFeeCents === 0) continue
      const { data: lossTx } = await admin.from('transactions').insert({
        user_id: loser.id,
        type: 'contest_settlement',
        status: 'completed',
        amount_cents: entryFeeCents,
        league_id: contestType === 'weekly' ? contestId : null,
        idempotency_key: `sim_loss_${loser.id}_${contestId}`,
        description: `Simulation loss: ${contestName}`,
        completed_at: new Date().toISOString(),
      }).select('id').single()

      if (lossTx) {
        await admin.from('ledger_entries').insert([
          { transaction_id: lossTx.id, ledger_account_id: loser.pendingAcctId, amount_cents: -entryFeeCents },
        ])
      }
    }

    // Credit rake to platform account
    if (rake > 0) {
      const { data: rakeAcct } = await admin.from('ledger_accounts').select('id').eq('name', 'platform_rake').single()
      if (rakeAcct) {
        const { data: rakeTx } = await admin.from('transactions').insert({
          user_id: ADMIN_ID,
          type: 'rake',
          status: 'completed',
          amount_cents: rake,
          league_id: contestType === 'weekly' ? contestId : null,
          idempotency_key: `sim_rake_${contestId}_${Date.now()}`,
          description: `Simulation rake: ${contestName}`,
          completed_at: new Date().toISOString(),
        }).select('id').single()

        if (rakeTx) {
          await admin.from('ledger_entries').insert([
            { transaction_id: rakeTx.id, ledger_account_id: rakeAcct.id, amount_cents: rake },
          ])
        }
      }
    }
  }

  const realUsersIncluded = allEntrants.length - botUsers.length
  return NextResponse.json({
    success: true,
    contestName,
    botsCreated: botUsers.length,
    realUsersIncluded,
    totalEntrants: allEntrants.length,
    entriesCreated: botUsers.length,
    totalPoolCents: entryFeeCents * allEntrants.length,
    netPoolCents: Math.floor(entryFeeCents * allEntrants.length * 0.95),
    rakeCents: Math.floor(entryFeeCents * allEntrants.length * 0.05),
    payouts,
    errors,
  })
}
