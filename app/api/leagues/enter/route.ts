import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getStateFromIP, checkStateRestriction, logComplianceEvent } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/enter
 * Body: { league_id: string, team_name: string }
 *
 * Wallet-based league join. Deducts buy_in (in cents) from the user's wallet,
 * inserts a contest_entry, and adds the user to league_members.
 *
 * Free leagues: join directly (no wallet deduction).
 * Paid leagues: requires balance >= buy_in_cents.
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { league_id, team_name } = body as { league_id?: string; team_name?: string };

  if (!league_id || !team_name?.trim()) {
    return NextResponse.json({ error: 'league_id and team_name required' }, { status: 400 });
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
    return NextResponse.json({ error: 'League is not accepting entries' }, { status: 400 });
  }

  // Check not already a member
  const { data: existing } = await admin
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', user.id)
    .single();

  if (existing) return NextResponse.json({ error: 'Already a member' }, { status: 409 });

  // Count current members for draft_slot + capacity check
  const { count: memberCount } = await admin
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league_id);

  if ((memberCount ?? 0) >= league.league_size) {
    return NextResponse.json({ error: 'League is full' }, { status: 400 });
  }

  const buyInCents = Math.round((league.buy_in ?? 0) * 100);

  // ── State restriction check (paid leagues only) ──────────────────────────
  if (buyInCents > 0) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? '';
    const stateCode = await getStateFromIP(ip);
    if (stateCode) {
      const { restricted, stateName } = await checkStateRestriction(stateCode);
      if (restricted) {
        await logComplianceEvent(user.id, 'blocked_entry', { route: 'leagues/enter', league_id, stateCode }, ip, req.headers.get('user-agent') ?? '');
        return NextResponse.json({
          error: `Cash contests and deposits are unavailable while you are located in ${stateName}. You may still access your account and withdraw funds.`,
          restricted: true,
          state_code: stateCode,
        }, { status: 403 });
      }
    }
  }

  // ── Free league ──────────────────────────────────────────────────────────
  if (buyInCents === 0) {
    await admin.from('league_members').insert({
      league_id,
      user_id:    user.id,
      team_name:  team_name.trim(),
      draft_slot: (memberCount ?? 0) + 1,
      paid:       true,
    });
    return NextResponse.json({ success: true, charged_cents: 0 });
  }

  // ── Paid league — deduct from wallet ────────────────────────────────────
  const { data: wallet } = await admin
    .from('wallets')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  const currentBalance = wallet?.balance ?? 0;

  if (currentBalance < buyInCents) {
    return NextResponse.json({
      error: `Insufficient balance. Need $${(buyInCents / 100).toFixed(2)}, have $${(currentBalance / 100).toFixed(2)}.`,
      code:  'INSUFFICIENT_BALANCE',
      need_cents:    buyInCents,
      balance_cents: currentBalance,
    }, { status: 400 });
  }

  const balanceAfter = currentBalance - buyInCents;

  // Deduct wallet
  await admin
    .from('wallets')
    .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  // Insert transaction
  const { data: tx } = await admin
    .from('transactions')
    .insert({
      user_id:        user.id,
      type:           'contest_entry',
      amount:         buyInCents,
      balance_before: currentBalance,
      balance_after:  balanceAfter,
      league_id,
      status:         'completed',
      description:    `Entry — ${league.name}`,
    })
    .select('id')
    .single();

  // Insert contest_entries
  await admin.from('contest_entries').insert({
    user_id:        user.id,
    league_id,
    amount_paid:    buyInCents,
    transaction_id: tx?.id ?? null,
    status:         'active',
  });

  // Add to league_members
  await admin.from('league_members').insert({
    league_id,
    user_id:    user.id,
    team_name:  team_name.trim(),
    draft_slot: (memberCount ?? 0) + 1,
    paid:       true,
  });

  return NextResponse.json({ success: true, charged_cents: buyInCents });
}
