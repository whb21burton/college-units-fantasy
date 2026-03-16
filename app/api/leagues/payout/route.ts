import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/payout
 * Body: { league_id: string, winner_user_id: string }
 *
 * Commissioner-only. Credits the winner's wallet with the prize pool payout.
 * Marks the pool as paid_out and the league as complete.
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { league_id, winner_user_id } = await req.json();
  if (!league_id || !winner_user_id) {
    return NextResponse.json({ error: 'league_id and winner_user_id required' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify requester is commissioner
  const { data: league } = await admin
    .from('leagues')
    .select('id, name, commissioner_id, status')
    .eq('id', league_id)
    .single();

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (league.commissioner_id !== user.id) {
    return NextResponse.json({ error: 'Only the commissioner can trigger payouts' }, { status: 403 });
  }
  if (league.status === 'complete') {
    return NextResponse.json({ error: 'Payout already processed' }, { status: 400 });
  }

  // Load pool
  const { data: pool } = await admin
    .from('pools')
    .select('payout_amount, status')
    .eq('league_id', league_id)
    .single();

  if (!pool) return NextResponse.json({ error: 'Prize pool not found' }, { status: 404 });
  if (pool.status === 'paid_out') {
    return NextResponse.json({ error: 'Prize pool already paid out' }, { status: 400 });
  }

  const payout = Number(pool.payout_amount);

  // Credit winner's wallet (withdrawable — they can cash out)
  const { error: creditErr } = await admin.rpc('wallet_credit', {
    p_user_id:      winner_user_id,
    p_amount:       payout,
    p_type:         'payout',
    p_league_id:    league_id,
    p_description:  `Prize payout — ${league.name}`,
    p_withdrawable: true,
  });
  if (creditErr) return NextResponse.json({ error: creditErr.message }, { status: 500 });

  // Mark pool as paid
  await admin
    .from('pools')
    .update({
      status:      'paid_out',
      winner_id:   winner_user_id,
      paid_out_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('league_id', league_id);

  // Mark league complete
  await admin
    .from('leagues')
    .update({ status: 'complete' })
    .eq('id', league_id);

  return NextResponse.json({ success: true, payout_amount: payout });
}
