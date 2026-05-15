import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/[id]/pay-entry
 *
 * Charges the authenticated user's wallet for the league entry fee.
 * Idempotent — returns 409 if already paid.
 *
 * Ledger:
 *   debit  user_available  -buyInCents
 *   credit user_pending    +buyInCents
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const leagueId = params.id;

    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, league_type, status')
      .eq('id', leagueId)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.buy_in === 0) return NextResponse.json({ error: 'Free league — no payment required' }, { status: 400 });
    if (league.league_type === 'weekly') {
      return NextResponse.json({ error: 'Weekly leagues do not require entry payment' }, { status: 400 });
    }

    const buyInCents = Math.round(league.buy_in * 100);

    // Verify user is a league member
    const { data: member } = await admin
      .from('league_members')
      .select('id')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .single();

    if (!member) return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });

    // Idempotency check — already paid?
    const { data: existingTx } = await admin
      .from('transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('league_id', leagueId)
      .eq('type', 'contest_entry')
      .eq('status', 'completed')
      .limit(1)
      .single();

    if (existingTx) return NextResponse.json({ error: 'Already paid for this league' }, { status: 409 });

    // Get wallet and ledger accounts
    const { data: wallet } = await admin
      .from('wallets')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 402 });

    const { data: accounts } = await admin
      .from('ledger_accounts')
      .select('id, type')
      .eq('wallet_id', wallet.id);

    const availableAcct = accounts?.find(a => a.type === 'user_available');
    const pendingAcct   = accounts?.find(a => a.type === 'user_pending');

    if (!availableAcct || !pendingAcct) {
      return NextResponse.json({ error: 'Ledger accounts not found' }, { status: 500 });
    }

    // Compute available balance
    const { data: entries } = await admin
      .from('ledger_entries')
      .select('amount_cents')
      .eq('ledger_account_id', availableAcct.id);

    const currentBalance = entries?.reduce((sum, e) => sum + Number(e.amount_cents), 0) ?? 0;

    if (currentBalance < buyInCents) {
      return NextResponse.json({
        error:    'Insufficient balance',
        balance:  currentBalance,
        required: buyInCents,
      }, { status: 402 });
    }

    // Create contest_entry transaction
    const { data: tx } = await admin
      .from('transactions')
      .insert({
        user_id:         user.id,
        type:            'contest_entry',
        status:          'completed',
        amount_cents:    buyInCents,
        league_id:       leagueId,
        idempotency_key: `entry_${leagueId}_${user.id}`,
        description:     `Contest entry: ${league.name}`,
        completed_at:    new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!tx) return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });

    // Double-entry: debit available, credit pending
    await admin.from('ledger_entries').insert([
      { transaction_id: tx.id, ledger_account_id: availableAcct.id, amount_cents: -buyInCents },
      { transaction_id: tx.id, ledger_account_id: pendingAcct.id,   amount_cents: +buyInCents },
    ]);

    return NextResponse.json({ success: true, newBalance: currentBalance - buyInCents });
  } catch (err: any) {
    console.error('[pay-entry]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to process payment' }, { status: 500 });
  }
}
