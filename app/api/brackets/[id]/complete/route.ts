import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

function getAdaptedStructure(structure: string, n: number): string {
  if (structure === 'top3') {
    if (n <= 1) return 'winner_take_all'
    if (n === 2) return 'top2'
    return 'top3'
  }
  if (structure === 'top2') {
    if (n <= 1) return 'winner_take_all'
    return 'top2'
  }
  return structure
}

const POINTS = {
  regional:       3,
  super_regional: 5,
  omaha:          10,
  championship:   15,
  series_bonus:   5,
}

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const contestId = params.id

  // Auth: admin user session OR admin key header (for server-side calls from save-bracket-results)
  const adminKey = req.headers.get('x-admin-key')
  const isAdminKey = adminKey && adminKey === process.env.CRON_SECRET
  if (!isAdminKey) {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== ADMIN_ID) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  const body = await req.json().catch(() => ({}))
  const results = body.results as {
    regionalWinners: Record<string, string>
    srWinners: Record<string, string>
    omahaAWinner: string
    omahaBWinner: string
    champion: string
    seriesResult: string
  } | undefined

  const admin = createAdminClient()

  const { data: contest } = await admin
    .from('bracket_contests')
    .select('id, name, entry_fee_cents, entry_count, settings, status')
    .eq('id', contestId)
    .single()
  if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  if (contest.status === 'completed') return NextResponse.json({ error: 'Already completed' }, { status: 400 })

  // Get all submitted entries with bracket_data for scoring
  const { data: rawEntries } = await admin
    .from('user_bracket_entries')
    .select('id, user_id, total_score, entry_name, bracket_data')
    .eq('contest_id', contestId)
    .eq('is_submitted', true)

  // Score each entry using bracket_data picks vs results from platform_settings
  const scored = (rawEntries ?? []).map(entry => {
    const picks = entry.bracket_data ?? {}
    let score = 0

    if (results) {
      // Regional picks
      for (const [regionKey, winnerName] of Object.entries(results.regionalWinners ?? {})) {
        if (!winnerName) continue
        const pick = picks.regionals?.[regionKey]
        if (pick && pick.name === winnerName) score += POINTS.regional
      }
      // Super regional picks
      for (const [idxStr, winnerName] of Object.entries(results.srWinners ?? {})) {
        if (!winnerName) continue
        const pick = picks.superRegionals?.[parseInt(idxStr)]
        if (pick && pick.name === winnerName) score += POINTS.super_regional
      }
      // Omaha bracket picks
      if (results.omahaAWinner && picks.omahaA?.name === results.omahaAWinner) score += POINTS.omaha
      if (results.omahaBWinner && picks.omahaB?.name === results.omahaBWinner) score += POINTS.omaha
      // Champion
      if (results.champion && picks.champion?.name === results.champion) {
        score += POINTS.championship
        if (results.seriesResult && picks.seriesResult === results.seriesResult) {
          score += POINTS.series_bonus
        }
      }
    } else {
      score = entry.total_score ?? 0
    }

    return { ...entry, computedScore: score }
  })

  // Persist computed scores, then rank
  for (const entry of scored) {
    await admin.from('user_bracket_entries')
      .update({ total_score: entry.computedScore, correct_picks: entry.computedScore })
      .eq('id', entry.id)
  }

  const entries = scored.sort((a, b) => b.computedScore - a.computedScore)
  const totalEntries = entries.length
  const feeCents = contest.entry_fee_cents ?? 0
  const totalPoolCents = feeCents * totalEntries
  const rakeCents = Math.floor(totalPoolCents * 0.05)
  const netPoolCents = totalPoolCents - rakeCents
  const payoutStructure: string = contest.settings?.payout_structure ?? 'winner_take_all'

  // Assign ranks using standard competition ranking (ties get same rank)
  const rankedEntries = entries.map(entry => {
    const higherCount = entries.filter(e => e.computedScore > entry.computedScore).length
    return { ...entry, rank: higherCount + 1 }
  })

  for (const entry of rankedEntries) {
    await admin.from('user_bracket_entries').update({ rank: entry.rank }).eq('id', entry.id)
  }

  // Determine winners and payout amounts
  type Payout = { entryId: string; userId: string; entryName: string; amountCents: number; rank: number }
  const payouts: Payout[] = []

  const adaptedStructure = getAdaptedStructure(payoutStructure, totalEntries)

  if (netPoolCents > 0 && totalEntries > 0 && feeCents > 0) {
    if (adaptedStructure === 'double_up') {
      const winners = Math.floor(totalEntries / 2)
      const hasMiddle = totalEntries % 2 !== 0
      const perWinner = Math.floor(feeCents * 1.95)
      for (const entry of rankedEntries) {
        if (entry.rank <= winners) {
          payouts.push({ entryId: entry.id, userId: entry.user_id, entryName: entry.entry_name ?? '', amountCents: perWinner, rank: entry.rank })
        } else if (hasMiddle && entry.rank === winners + 1) {
          payouts.push({ entryId: entry.id, userId: entry.user_id, entryName: entry.entry_name ?? '', amountCents: feeCents, rank: entry.rank })
        }
      }
    } else if (adaptedStructure === 'winner_take_all') {
      const w = rankedEntries.find(e => e.rank === 1)
      if (w) payouts.push({ entryId: w.id, userId: w.user_id, entryName: w.entry_name ?? '', amountCents: netPoolCents, rank: 1 })
    } else if (adaptedStructure === 'top2') {
      const p1 = Math.floor(netPoolCents * 0.70)
      const p2 = netPoolCents - p1
      const r1 = rankedEntries.find(e => e.rank === 1)
      const r2 = rankedEntries.find(e => e.rank === 2)
      if (r1) payouts.push({ entryId: r1.id, userId: r1.user_id, entryName: r1.entry_name ?? '', amountCents: p1, rank: 1 })
      if (r2) payouts.push({ entryId: r2.id, userId: r2.user_id, entryName: r2.entry_name ?? '', amountCents: p2, rank: 2 })
    } else if (adaptedStructure === 'top3') {
      const p1 = Math.floor(netPoolCents * 0.60)
      const p2 = Math.floor(netPoolCents * 0.25)
      const p3 = netPoolCents - p1 - p2
      const r1 = rankedEntries.find(e => e.rank === 1)
      const r2 = rankedEntries.find(e => e.rank === 2)
      const r3 = rankedEntries.find(e => e.rank === 3)
      if (r1) payouts.push({ entryId: r1.id, userId: r1.user_id, entryName: r1.entry_name ?? '', amountCents: p1, rank: 1 })
      if (r2) payouts.push({ entryId: r2.id, userId: r2.user_id, entryName: r2.entry_name ?? '', amountCents: p2, rank: 2 })
      if (r3) payouts.push({ entryId: r3.id, userId: r3.user_id, entryName: r3.entry_name ?? '', amountCents: p3, rank: 3 })
    }
  }

  // Process all entries independently: credit winners, release pending for all
  const winnerEntryIds = new Set(payouts.map(p => p.entryId))
  for (const entry of rankedEntries) {
    const { data: wallet } = await admin
      .from('wallets').select('id').eq('user_id', entry.user_id).single()
    if (!wallet) continue
    const { data: accounts } = await admin
      .from('ledger_accounts').select('id, type').eq('wallet_id', wallet.id)
    const availAcct   = accounts?.find(a => a.type === 'user_available')
    const pendingAcct = accounts?.find(a => a.type === 'user_pending')
    if (!availAcct || !pendingAcct) continue

    const payout = payouts.find(p => p.entryId === entry.id)
    const isWinner = winnerEntryIds.has(entry.id)

    const { data: settleTx } = await admin.from('transactions').insert({
      user_id:         entry.user_id,
      type:            'contest_settlement',
      status:          'completed',
      amount_cents:    payout?.amountCents ?? 0,
      description:     isWinner
        ? `Bracket payout: ${contest.name} — rank #${payout!.rank}`
        : `Bracket settlement: ${contest.name} — no payout`,
      idempotency_key: `bracket_settle_${contestId}_${entry.id}`,
      completed_at:    new Date().toISOString(),
    }).select('id').single()

    if (settleTx) {
      const ledgerInserts: any[] = []
      if (feeCents > 0) {
        // Release from pending for all entrants
        ledgerInserts.push({ transaction_id: settleTx.id, ledger_account_id: pendingAcct.id, amount_cents: -feeCents })
      }
      if (isWinner && payout) {
        // Credit winnings to available
        ledgerInserts.push({ transaction_id: settleTx.id, ledger_account_id: availAcct.id, amount_cents: +payout.amountCents })
      }
      if (ledgerInserts.length > 0) {
        await admin.from('ledger_entries').insert(ledgerInserts)
      }
    }
  }

  // Record admin stats (requires admin_contest_stats table — create it if missing)
  try {
    await admin.from('admin_contest_stats').insert({
      contest_id:       contestId,
      contest_name:     contest.name,
      contest_type:     'bracket',
      total_entries:    totalEntries,
      total_pool_cents: totalPoolCents,
      rake_cents:       rakeCents,
      net_pool_cents:   netPoolCents,
      payout_count:     payouts.length,
      completed_at:     new Date().toISOString(),
    })
  } catch {
    // table may not exist yet; non-fatal
  }

  await admin.from('bracket_contests').update({ status: 'completed' }).eq('id', contestId)

  return NextResponse.json({
    completed:    true,
    totalEntries,
    netPoolCents,
    rakeCents,
    payouts: payouts.map(p => ({ rank: p.rank, entryName: p.entryName, amountCents: p.amountCents })),
  })
}
