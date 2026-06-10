import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, settings')
    .eq('id', params.id)
    .single();

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (league.commissioner_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await req.json();
  const { name, league_size, draft_type, settings: settingsPatch } = body;

  const update: Record<string, any> = {};
  if (name        !== undefined) update.name        = name.trim();
  if (league_size !== undefined) update.league_size = Number(league_size);
  if (draft_type  !== undefined) update.draft_type  = draft_type;
  if (settingsPatch !== undefined) {
    update.settings = { ...(league.settings ?? {}), ...settingsPatch };
  }

  const { error } = await supabase.from('leagues').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: league } = await admin
    .from('leagues')
    .select('commissioner_id, name, buy_in, league_type')
    .eq('id', params.id)
    .single();

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

  const isAdmin = user.email === 'whb21burton@gmail.com';
  if (league.commissioner_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const buyCents = Math.round((league.buy_in ?? 0) * 100);
  let refundCount = 0;

  // If paid season league — refund all members who paid (100%, no rake deduction)
  if (buyCents > 0 && league.league_type !== 'weekly') {
    const { data: entryTxs } = await admin
      .from('transactions')
      .select('id, user_id, amount_cents')
      .eq('league_id', params.id)
      .eq('type', 'contest_entry')
      .eq('status', 'completed');

    for (const tx of entryTxs ?? []) {
      const { data: wallet } = await admin
        .from('wallets')
        .select('id')
        .eq('user_id', tx.user_id)
        .single();

      if (!wallet) continue;

      const { data: accounts } = await admin
        .from('ledger_accounts')
        .select('id, type')
        .eq('wallet_id', wallet.id);

      const availAcct   = accounts?.find(a => a.type === 'user_available');
      const pendingAcct = accounts?.find(a => a.type === 'user_pending');
      if (!availAcct) continue;

      const { data: refundTx } = await admin
        .from('transactions')
        .insert({
          user_id: tx.user_id,
          type: 'refund',
          status: 'completed',
          amount_cents: tx.amount_cents,
          league_id: params.id,
          idempotency_key: `delete_refund_${params.id}_${tx.user_id}`,
          description: `Refund: ${league.name} deleted by commissioner`,
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!refundTx) continue;

      const entries: { transaction_id: string; ledger_account_id: string; amount_cents: number }[] = [
        { transaction_id: refundTx.id, ledger_account_id: availAcct.id, amount_cents: tx.amount_cents },
      ];
      if (pendingAcct) {
        entries.push({ transaction_id: refundTx.id, ledger_account_id: pendingAcct.id, amount_cents: -tx.amount_cents });
      }
      await admin.from('ledger_entries').insert(entries);

      await admin.from('transactions').update({ status: 'reversed' }).eq('id', tx.id);

      refundCount++;
    }
  }

  // Delete in FK dependency order
  // 1. ledger_entries linked to this league's transactions
  const { data: allTxs } = await admin.from('transactions').select('id').eq('league_id', params.id);
  if (allTxs?.length) {
    await admin.from('ledger_entries').delete().in('transaction_id', allTxs.map(t => t.id));
  }

  // 2. transactions
  await admin.from('transactions').delete().eq('league_id', params.id);

  // 3. draft_picks
  await admin.from('draft_picks').delete().eq('league_id', params.id);

  // 4. league_members
  await admin.from('league_members').delete().eq('league_id', params.id);

  // 5. league
  const { error } = await admin.from('leagues').delete().eq('id', params.id);
  if (error) {
    console.error('[DELETE league] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[DELETE league] success, refunds issued:', refundCount);
  return NextResponse.json({
    success: true,
    refunded: refundCount,
    message: refundCount > 0
      ? `League deleted. ${refundCount} member${refundCount > 1 ? 's' : ''} refunded $${(buyCents / 100).toFixed(2)} each.`
      : 'League deleted.',
  });
}
