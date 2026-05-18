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

  const { contestType, contestId, numBots, simulateResults } = await req.json()
  const admin = createAdminClient()

  // Get contest details
  let entryFeeCents = 0
  let payoutStructure = 'winner_take_all'
  let contestName = ''

  if (contestType === 'weekly') {
    const { data: league } = await admin.from('leagues').select('buy_in, name, settings, league_size, league_type').eq('id', contestId).single()
    entryFeeCents = Math.round((league?.buy_in ?? 0) * 100)
    const settings = league?.settings as any
    payoutStructure = settings?.payout_structure ?? 'winner_take_all'
    contestName = league?.name ?? 'Weekly Contest'
    console.log('[simulate] league settings:', JSON.stringify(settings))
    console.log('[simulate] payoutStructure:', payoutStructure)
  } else {
    const { data: contest } = await admin.from('bracket_contests').select('entry_fee_cents, name, settings').eq('id', contestId).single()
    entryFeeCents = contest?.entry_fee_cents ?? 0
    payoutStructure = contest?.settings?.payout_structure ?? 'winner_take_all'
    contestName = contest?.name ?? 'Bracket Contest'
  }

  const botUsers: {
    id: string
    email: string
    walletId: string
    availAcctId: string
    pendingAcctId: string
    entryTxId: string | undefined
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

  const payouts: { rank: number; botEmail: string; payoutCents: number; payoutDollars: string }[] = []

  if (simulateResults && botUsers.length > 0) {
    // Shuffle for random rankings
    const ranked = [...botUsers].sort(() => Math.random() - 0.5)

    const totalPool = entryFeeCents * ranked.length
    const netPool   = Math.floor(totalPool * 0.95)
    const rake      = totalPool - netPool

    const splits =
      payoutStructure === 'top3' ? [{ rank: 1, pct: 0.60 }, { rank: 2, pct: 0.25 }, { rank: 3, pct: 0.15 }] :
      payoutStructure === 'top2' ? [{ rank: 1, pct: 0.70 }, { rank: 2, pct: 0.30 }] :
                                   [{ rank: 1, pct: 1.00 }]

    // Build winner map: rank → bot (consistent index for both payout and loser exclusion)
    const winnerMap = new Map<number, typeof ranked[number]>()
    for (const split of splits) {
      const winner = ranked[split.rank - 1]
      if (winner) winnerMap.set(split.rank, winner)
    }

    // Pay out winners
    for (const rank of Array.from(winnerMap.keys())) {
      const winner = winnerMap.get(rank)!
      const split = splits.find(s => s.rank === rank)!
      const payoutCents = Math.floor(netPool * split.pct)

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

      payouts.push({ rank, botEmail: winner.email, payoutCents, payoutDollars: (payoutCents / 100).toFixed(2) })
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

  return NextResponse.json({
    success: true,
    contestName,
    botsCreated: botUsers.length,
    entriesCreated: botUsers.length,
    totalPoolCents: entryFeeCents * botUsers.length,
    netPoolCents: Math.floor(entryFeeCents * botUsers.length * 0.95),
    rakeCents: Math.floor(entryFeeCents * botUsers.length * 0.05),
    payouts,
    errors,
  })
}
