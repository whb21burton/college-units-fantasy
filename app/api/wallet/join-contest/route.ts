import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
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

    const admin = createAdminClient();

    // Load league
    const { data: league } = await admin
      .from('leagues')
      .select('id, name, buy_in, league_size, status, is_public, draft_type, league_type, settings, max_entries_per_user')
      .eq('id', league_id)
      .single();

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.status !== 'forming') {
      return NextResponse.json({ error: 'League is not accepting members' }, { status: 400 });
    }

    if (league.league_type === 'bracket') {
      // Bracket leagues: user is already a member — only block duplicate payments
      const { data: existingPayment } = await admin
        .from('transactions')
        .select('id')
        .eq('league_id', league_id)
        .eq('user_id', user.id)
        .eq('type', 'contest_entry')
        .eq('status', 'completed')
        .single();
      if (existingPayment) {
        return NextResponse.json({ error: 'Entry fee already paid for this contest' }, { status: 400 });
      }
    } else {
      // Non-bracket leagues: block duplicate membership
      const { count: userEntryCount } = await admin
        .from('league_members')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', league_id)
        .eq('user_id', user.id);
      const currentUserEntries = userEntryCount ?? 0;
      if (!league.is_public) {
        if (currentUserEntries >= 1) {
          return NextResponse.json({ error: 'Already a member' }, { status: 409 });
        }
      } else if (league.max_entries_per_user && league.max_entries_per_user > 0) {
        if (currentUserEntries >= league.max_entries_per_user) {
          return NextResponse.json(
            { error: `Maximum ${league.max_entries_per_user} entries per account reached` },
            { status: 400 }
          );
        }
      }
    }
    // Public no-cap (max_entries_per_user is null): no per-user limit

    // Count current total members for draft_slot assignment and capacity check
    const { count: memberCount } = await admin
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league_id);

    // For private leagues enforce capacity; public leagues fill remaining with CPU bots
    if (!league.is_public && (memberCount ?? 0) >= league.league_size) {
      return NextResponse.json({ error: 'League is full' }, { status: 400 });
    }
    // Public leagues: also check total capacity
    if (league.is_public && (memberCount ?? 0) >= league.league_size) {
      return NextResponse.json({ error: 'Contest is full' }, { status: 400 });
    }

    const buyInCents = Math.round((league.buy_in ?? 0) * 100);

    // ── Free league ──────────────────────────────────────────────────────────
    if (buyInCents === 0) {
      if (league.league_type !== 'bracket') {
        await admin.from('league_members').insert({
          league_id,
          user_id:    user.id,
          team_name:  team_name.trim(),
          draft_slot: (memberCount ?? 0) + 1,
          paid:       true,
        });
      }
    } else {
      // ── Paid league — deduct from wallet atomically ────────────────────────
      const { error: rpcError } = await admin.rpc('debit_wallet', {
        p_user_id:         user.id,
        p_amount_cents:    buyInCents,
        p_type:            'contest_entry',
        p_description:     `Contest entry: ${league.name}`,
        p_idempotency_key: `entry_${league_id}_${user.id}`,
      });

      if (rpcError) {
        if (rpcError.message.includes('Insufficient balance') || rpcError.message.includes('Wallet not found')) {
          return NextResponse.json({
            error:    rpcError.message,
            code:     'INSUFFICIENT_BALANCE',
            balance:  0,
            required: buyInCents,
          }, { status: 402 });
        }
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }

      if (league.league_type !== 'bracket') {
        await admin.from('league_members').insert({
          league_id,
          user_id:    user.id,
          team_name:  team_name.trim(),
          draft_slot: (memberCount ?? 0) + 1,
          paid:       true,
        });
      }
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

      const dest = league.league_type === 'weekly'
        ? `/league/${league.id}/lineup`
        : `/league/${league.id}/draft`;
      return NextResponse.json({ success: true, newBalance: null, leagueId: league.id, redirect: dest });
    }

    return NextResponse.json({ success: true, newBalance: null });
  } catch (err: any) {
    console.error('[join-contest]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to join contest' }, { status: 500 });
  }
}
