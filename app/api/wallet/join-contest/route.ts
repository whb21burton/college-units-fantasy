import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/join-contest
 * Body: { league_id: string, team_name: string }
 *
 * Free leagues: insert league_member directly.
 * Paid leagues: call deduct_balance RPC atomically, insert member, record transaction.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { league_id, team_name } = body as { league_id?: string; team_name?: string };

    if (!league_id || !team_name?.trim()) {
      return NextResponse.json({ error: 'league_id and team_name are required' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Load league
    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, league_size, status')
      .eq('id', league_id)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.status !== 'forming') {
      return NextResponse.json({ error: 'League is not accepting members' }, { status: 400 });
    }

    // Check not already a member
    const { data: existing } = await admin
      .from('league_members')
      .select('id')
      .eq('league_id', league_id)
      .eq('user_id', user.id)
      .single();
    if (existing) return NextResponse.json({ error: 'Already a member' }, { status: 409 });

    // Count members for capacity + draft_slot
    const { count: memberCount } = await admin
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league_id);

    if ((memberCount ?? 0) >= league.league_size) {
      return NextResponse.json({ error: 'League is full' }, { status: 400 });
    }

    const buyInCents = Math.round((league.buy_in ?? 0) * 100);

    // ── Free league ──────────────────────────────────────────────────────────
    if (buyInCents === 0) {
      await admin.from('league_members').insert({
        league_id,
        user_id:    user.id,
        team_name:  team_name.trim(),
        draft_slot: (memberCount ?? 0) + 1,
        paid:       true,
      });
      return NextResponse.json({ success: true, newBalance: null });
    }

    // ── Paid league — deduct from wallet atomically ──────────────────────────
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const currentBalance = wallet?.balance ?? 0;

    if (currentBalance < buyInCents) {
      return NextResponse.json({
        error:    'Insufficient balance',
        code:     'INSUFFICIENT_BALANCE',
        balance:  currentBalance,
        required: buyInCents,
      }, { status: 402 });
    }

    // Atomically deduct
    const { data: newBalance, error: rpcErr } = await admin
      .rpc('deduct_balance', { p_user_id: user.id, p_amount: buyInCents });

    if (rpcErr) {
      if (rpcErr.message?.includes('INSUFFICIENT_BALANCE')) {
        return NextResponse.json({ error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' }, { status: 402 });
      }
      throw rpcErr;
    }

    // Insert member
    await admin.from('league_members').insert({
      league_id,
      user_id:    user.id,
      team_name:  team_name.trim(),
      draft_slot: (memberCount ?? 0) + 1,
      paid:       true,
    });

    // Record transaction
    await admin.from('transactions').insert({
      user_id:        user.id,
      type:           'contest_entry',
      amount:         buyInCents,
      balance_before: currentBalance,
      balance_after:  newBalance as number,
      league_id,
      status:         'completed',
      description:    `Entry — ${league.name}`,
    });

    return NextResponse.json({ success: true, newBalance: newBalance as number });
  } catch (err: any) {
    console.error('[join-contest]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to join contest' }, { status: 500 });
  }
}
