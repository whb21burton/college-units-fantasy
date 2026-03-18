import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/payout
 * Body: { league_id: string, first_place_user_id: string, second_place_user_id: string }
 *
 * Commissioner-only. Credits winners' wallets from the contest prize pool.
 *   1st place → 80%
 *   2nd place → 20%
 *
 * Prize pool = sum of contest_entries.amount_paid for this league.
 * Pure wallet credit — no Stripe transfer.
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { league_id, first_place_user_id, second_place_user_id } = body as {
    league_id?:            string;
    first_place_user_id?:  string;
    second_place_user_id?: string;
  };

  if (!league_id || !first_place_user_id || !second_place_user_id) {
    return NextResponse.json(
      { error: 'league_id, first_place_user_id, and second_place_user_id are required' },
      { status: 400 },
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify commissioner
  const { data: league } = await admin
    .from('leagues')
    .select('id, name, commissioner_id, status')
    .eq('id', league_id)
    .single();

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (league.commissioner_id !== user.id) {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 });
  }

  // Guard double payout
  const { count: existingPayouts } = await admin
    .from('payouts')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league_id);

  if ((existingPayouts ?? 0) > 0) {
    return NextResponse.json({ error: 'Payouts already issued for this league' }, { status: 409 });
  }

  // Calculate prize pool from actual contest entries
  const { data: entries } = await admin
    .from('contest_entries')
    .select('amount_paid')
    .eq('league_id', league_id)
    .eq('status', 'active');

  const prizePoolCents = (entries ?? []).reduce((sum, e) => sum + (e.amount_paid ?? 0), 0);

  if (prizePoolCents <= 0) {
    return NextResponse.json({ error: 'No prize pool — no paid entries' }, { status: 400 });
  }

  const firstCents  = Math.floor(prizePoolCents * 0.80);
  const secondCents = prizePoolCents - firstCents;

  // Credit wallets for both winners
  async function creditWallet(userId: string, amount: number, place: number) {
    const { data: w } = await admin
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    const before = w?.balance ?? 0;
    const after  = before + amount;

    await admin
      .from('wallets')
      .upsert({ user_id: userId, balance: after, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    const { data: tx } = await admin
      .from('transactions')
      .insert({
        user_id:        userId,
        type:           'winnings',
        amount,
        balance_before: before,
        balance_after:  after,
        league_id,
        status:         'completed',
        description:    `${place === 1 ? '1st' : '2nd'} place — ${league.name}`,
      })
      .select('id')
      .single();

    await admin.from('payouts').insert({
      league_id,
      user_id:        userId,
      place,
      amount,
      transaction_id: tx?.id ?? null,
      status:         'completed',
    });
  }

  await Promise.all([
    creditWallet(first_place_user_id, firstCents, 1),
    creditWallet(second_place_user_id, secondCents, 2),
  ]);

  // Mark contest entries as completed
  await admin
    .from('contest_entries')
    .update({ status: 'completed' })
    .eq('league_id', league_id);

  // Mark league complete
  await admin
    .from('leagues')
    .update({ status: 'complete' })
    .eq('id', league_id);

  return NextResponse.json({
    success:      true,
    prize_pool:   prizePoolCents,
    first_place:  firstCents,
    second_place: secondCents,
  });
}
