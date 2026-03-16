import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { splitEntryFee } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/enter
 * Body: { league_id: string }
 *
 * Deducts entry_fee from user wallet, credits prize pool.
 * Called after the user has already been added to league_members.
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { league_id } = await req.json();
  if (!league_id) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Load league to get entry_fee
  const { data: league, error: leagueErr } = await admin
    .from('leagues')
    .select('id, name, entry_fee, status')
    .eq('id', league_id)
    .single();

  if (leagueErr || !league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (league.status !== 'forming') {
    return NextResponse.json({ error: 'League is not accepting entries' }, { status: 400 });
  }

  const entryFee = Number(league.entry_fee ?? 0);

  // Free league — just mark paid
  if (entryFee === 0) {
    await admin
      .from('league_members')
      .update({ paid: true })
      .eq('league_id', league_id)
      .eq('user_id', user.id);
    return NextResponse.json({ success: true, charged: 0 });
  }

  // Check wallet balance
  const { data: wallet } = await admin
    .from('wallets')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  if (!wallet || wallet.balance < entryFee) {
    return NextResponse.json({
      error: `Insufficient balance. You need $${entryFee.toFixed(2)} but have $${(wallet?.balance ?? 0).toFixed(2)}.`,
      code: 'INSUFFICIENT_BALANCE',
    }, { status: 400 });
  }

  // Debit user wallet
  const { error: debitErr } = await admin.rpc('wallet_debit', {
    p_user_id:    user.id,
    p_amount:     entryFee,
    p_type:       'entry',
    p_league_id:  league_id,
    p_description: `Entry fee — ${league.name}`,
  });
  if (debitErr) return NextResponse.json({ error: debitErr.message }, { status: 500 });

  // Split into platform fee + prize payout
  const { fee, payout } = splitEntryFee(entryFee);

  // Update prize pool (upsert)
  await admin
    .from('pools')
    .upsert({
      league_id,
      total_amount:  admin.rpc ? undefined : 0, // handled below
      fee_amount:    fee,
      payout_amount: payout,
    })
    .select();

  // Increment pool amounts
  const { data: pool } = await admin
    .from('pools')
    .select('total_amount, fee_amount, payout_amount')
    .eq('league_id', league_id)
    .single();

  await admin
    .from('pools')
    .update({
      total_amount:  (pool?.total_amount  ?? 0) + entryFee,
      fee_amount:    (pool?.fee_amount    ?? 0) + fee,
      payout_amount: (pool?.payout_amount ?? 0) + payout,
      updated_at:    new Date().toISOString(),
    })
    .eq('league_id', league_id);

  // Mark member as paid
  await admin
    .from('league_members')
    .update({ paid: true })
    .eq('league_id', league_id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true, charged: entryFee, pool_payout: payout });
}
