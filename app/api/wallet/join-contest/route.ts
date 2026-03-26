import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const CPU_NAMES = [
  'Crimson AI', 'Bulldog Bot', 'Longhorn CPU', 'Buckeye Bot',
  'Duck AI', 'Tiger CPU', 'Vol Bot', 'Gator AI',
  'Sooner CPU', 'Bayou Bot', 'Nittany CPU',
];

/**
 * POST /api/wallet/join-contest
 * Body: { league_id: string, team_name: string }
 *
 * Free leagues:  insert league_member directly.
 * Paid leagues:  call deduct_balance RPC atomically, insert member, record transaction.
 *
 * Public leagues: after inserting the member, immediately build a CPU-filled draft
 * order and set league.status = 'drafting' so the user lands in a live draft room.
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
      .select('id, name, buy_in, league_size, status, is_public, draft_type, settings')
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

    // Count current members for draft_slot assignment
    const { count: memberCount } = await admin
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league_id);

    // For private leagues enforce capacity; public leagues draft with whoever joins
    if (!league.is_public && (memberCount ?? 0) >= league.league_size) {
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
    } else {
      // ── Paid league — deduct from wallet atomically ────────────────────────
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

      const { data: newBal, error: rpcErr } = await admin
        .rpc('deduct_balance', { p_user_id: user.id, p_amount: buyInCents });

      if (rpcErr) {
        if (rpcErr.message?.includes('INSUFFICIENT_BALANCE')) {
          return NextResponse.json({ error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' }, { status: 402 });
        }
        throw rpcErr;
      }

      await admin.from('league_members').insert({
        league_id,
        user_id:    user.id,
        team_name:  team_name.trim(),
        draft_slot: (memberCount ?? 0) + 1,
        paid:       true,
      });

      await admin.from('transactions').insert({
        user_id:        user.id,
        type:           'contest_entry',
        amount:         buyInCents,
        balance_before: currentBalance,
        balance_after:  newBal as number,
        league_id,
        status:         'completed',
        description:    `Entry — ${league.name}`,
      });
    }

    // ── For public leagues: trigger instant draft start ──────────────────────
    if (league.is_public) {
      // Fetch all members now (including the one just inserted)
      const { data: allMembers } = await admin
        .from('league_members')
        .select('user_id, team_name')
        .eq('league_id', league_id);

      const humanCount = allMembers?.length ?? 1;
      const cpuCount   = Math.max(0, league.league_size - humanCount);

      // Build draft order: all humans + CPU bots to fill league_size
      type DraftTeamEntry = { type: 'human' | 'cpu'; userId?: string; teamName: string; slot: number };
      const humanObjs: DraftTeamEntry[] = (allMembers ?? []).map(m => ({
        type: 'human', userId: m.user_id, teamName: m.team_name, slot: 0,
      }));
      const cpuObjs: DraftTeamEntry[] = CPU_NAMES.slice(0, cpuCount).map(name => ({
        type: 'cpu', teamName: name, slot: 0,
      }));

      const shuffled = [...humanObjs, ...cpuObjs].sort(() => Math.random() - 0.5);
      const draftOrder: DraftTeamEntry[] = shuffled.map((t, i) => ({ ...t, slot: i + 1 }));

      // Update draft_slots for human members
      await Promise.all(
        draftOrder
          .filter(t => t.type === 'human')
          .map(t =>
            admin.from('league_members')
              .update({ draft_slot: t.slot })
              .eq('league_id', league_id)
              .eq('user_id', t.userId!)
          )
      );

      // Activate draft
      await admin.from('leagues').update({
        status:   'drafting',
        settings: {
          ...(league.settings ?? {}),
          draft_order: draftOrder,
          cpu_teams: cpuObjs.map(c => c.teamName),
        },
      }).eq('id', league_id);

      return NextResponse.json({ success: true, newBalance: null, leagueId: league.id, redirect: `/league/${league.id}/draft` });
    }

    return NextResponse.json({ success: true, newBalance: null });
  } catch (err: any) {
    console.error('[join-contest]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to join contest' }, { status: 500 });
  }
}
