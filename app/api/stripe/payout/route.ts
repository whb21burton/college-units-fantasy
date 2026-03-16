import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/payout
 *
 * Commissioner-only. Transfers end-of-season prizes directly to winners'
 * Stripe Connect accounts.
 *
 *   Prize pool = buy_in (dollars) × number of paid members  (converted to cents)
 *   1st place  → 80% of prize pool
 *   2nd place  → 20% of prize pool
 *
 * Body: {
 *   league_id:            string;
 *   first_place_user_id:  string;
 *   second_place_user_id: string;
 * }
 * Auth: Bearer token — must be the league commissioner
 */
export async function POST(req: NextRequest) {
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

  // Auth
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Load league and verify commissioner
  const { data: league, error: leagueErr } = await admin
    .from('leagues')
    .select('id, name, buy_in, commissioner_id, status')
    .eq('id', league_id)
    .single();

  if (leagueErr || !league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }
  if (league.commissioner_id !== user.id) {
    return NextResponse.json({ error: 'Only the commissioner can trigger payouts' }, { status: 403 });
  }

  // Guard against double payout
  const { count: existingPayouts } = await admin
    .from('payouts')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league_id);

  if ((existingPayouts ?? 0) > 0) {
    return NextResponse.json({ error: 'Payouts already issued for this league' }, { status: 409 });
  }

  // Count paid members and calculate prize pool
  const { count: paidCount } = await admin
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league_id)
    .eq('paid', true);

  const buyInCents    = (league.buy_in ?? 0) * 100;
  const prizePoolCents = buyInCents * (paidCount ?? 0);

  if (prizePoolCents <= 0) {
    return NextResponse.json({ error: 'No prize pool — league has no paid buy-ins' }, { status: 400 });
  }

  const firstPlaceCents  = Math.floor(prizePoolCents * 0.80);
  const secondPlaceCents = prizePoolCents - firstPlaceCents; // remainder to avoid rounding loss

  // Load connect accounts for both winners
  const { data: members } = await admin
    .from('league_members')
    .select('user_id, stripe_connect_account_id')
    .eq('league_id', league_id)
    .in('user_id', [first_place_user_id, second_place_user_id]);

  const memberMap: Record<string, string> = {};
  for (const m of members ?? []) {
    if (m.user_id && m.stripe_connect_account_id) {
      memberMap[m.user_id] = m.stripe_connect_account_id;
    }
  }

  const firstAccount  = memberMap[first_place_user_id];
  const secondAccount = memberMap[second_place_user_id];

  if (!firstAccount || !secondAccount) {
    return NextResponse.json(
      { error: 'One or both winners have not connected a Stripe account. They must complete /api/stripe/connect/onboard first.' },
      { status: 400 },
    );
  }

  // Issue Stripe Transfers
  const [firstTransfer, secondTransfer] = await Promise.all([
    stripe.transfers.create({
      amount:      firstPlaceCents,
      currency:    'usd',
      destination: firstAccount,
      metadata:    { league_id, type: 'first_place', user_id: first_place_user_id },
    }),
    stripe.transfers.create({
      amount:      secondPlaceCents,
      currency:    'usd',
      destination: secondAccount,
      metadata:    { league_id, type: 'second_place', user_id: second_place_user_id },
    }),
  ]);

  // Record in payouts table
  await admin.from('payouts').insert([
    {
      league_id,
      user_id:           first_place_user_id,
      amount:            firstPlaceCents,
      stripe_transfer_id: firstTransfer.id,
      type:              'first_place',
    },
    {
      league_id,
      user_id:           second_place_user_id,
      amount:            secondPlaceCents,
      stripe_transfer_id: secondTransfer.id,
      type:              'second_place',
    },
  ]);

  // Mark league complete
  await admin
    .from('leagues')
    .update({ status: 'complete' })
    .eq('id', league_id);

  return NextResponse.json({
    success:       true,
    prize_pool:    prizePoolCents / 100,
    first_place:   firstPlaceCents  / 100,
    second_place:  secondPlaceCents / 100,
    first_transfer:  firstTransfer.id,
    second_transfer: secondTransfer.id,
  });
}
