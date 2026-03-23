import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/payout
 * Commissioner-only. Credits winners' wallets directly (no Stripe at payout time).
 * Winners withdraw separately via /api/wallet/withdraw.
 *
 * Body: { league_id, first_place_user_id, second_place_user_id }
 * Prize: 80% first, 20% second of (buy_in × paid_members)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { league_id, first_place_user_id, second_place_user_id } = body as {
      league_id?:            string;
      first_place_user_id?:  string;
      second_place_user_id?: string;
    };

    if (!league_id || !first_place_user_id || !second_place_user_id) {
      return NextResponse.json({ error: 'league_id, first_place_user_id, and second_place_user_id required' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Load + verify commissioner
    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, commissioner_id, status')
      .eq('id', league_id)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.commissioner_id !== user.id) {
      return NextResponse.json({ error: 'Only the commissioner can trigger payouts' }, { status: 403 });
    }
    if (league.status === 'complete') {
      return NextResponse.json({ error: 'Payouts already issued for this league' }, { status: 409 });
    }

    // Count paid members
    const { count: paidCount } = await admin
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league_id)
      .eq('paid', true);

    const buyInCents    = Math.round((league.buy_in ?? 0) * 100);
    const prizePoolCents = buyInCents * (paidCount ?? 0);

    if (prizePoolCents <= 0) {
      return NextResponse.json({ error: 'No prize pool — free league has no buy-ins' }, { status: 400 });
    }

    const firstCents  = Math.floor(prizePoolCents * 0.80);
    const secondCents = prizePoolCents - firstCents;

    // Get current balances for transaction records
    const { data: wallets } = await admin
      .from('wallets')
      .select('user_id, balance')
      .in('user_id', [first_place_user_id, second_place_user_id]);

    const balMap: Record<string, number> = {};
    for (const w of wallets ?? []) balMap[w.user_id] = w.balance;

    // Credit both wallets atomically
    const [firstRes, secondRes] = await Promise.all([
      admin.rpc('add_balance', { p_user_id: first_place_user_id,  p_amount: firstCents  }),
      admin.rpc('add_balance', { p_user_id: second_place_user_id, p_amount: secondCents }),
    ]);

    if (firstRes.error || secondRes.error) {
      console.error('[payout] add_balance error', firstRes.error, secondRes.error);
      return NextResponse.json({ error: 'Failed to credit wallets' }, { status: 500 });
    }

    // Record transactions
    await admin.from('transactions').insert([
      {
        user_id:        first_place_user_id,
        type:           'winnings',
        amount:         firstCents,
        balance_before: balMap[first_place_user_id]  ?? 0,
        balance_after:  firstRes.data  as number,
        league_id,
        status:         'completed',
        description:    `1st place — ${league.name}`,
      },
      {
        user_id:        second_place_user_id,
        type:           'winnings',
        amount:         secondCents,
        balance_before: balMap[second_place_user_id] ?? 0,
        balance_after:  secondRes.data as number,
        league_id,
        status:         'completed',
        description:    `2nd place — ${league.name}`,
      },
    ]);

    // Mark league complete
    await admin.from('leagues').update({ status: 'complete' }).eq('id', league_id);

    return NextResponse.json({
      success:      true,
      prizePool:    prizePoolCents  / 100,
      firstPayout:  firstCents     / 100,
      secondPayout: secondCents    / 100,
    });
  } catch (err: any) {
    console.error('[payout]', err);
    return NextResponse.json({ error: err?.message ?? 'Payout failed' }, { status: 500 });
  }
}
