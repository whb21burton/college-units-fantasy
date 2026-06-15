/**
 * POST /api/cron/process-waivers
 *
 * Runs daily at 3:00 AM UTC (vercel.json: "0 3 * * *").
 * Processes all pending waiver_claims for leagues whose processing time has arrived.
 *
 * ROLLING:  sort by waiver_priority.priority_position ASC, then claim.priority_rank ASC
 * FAAB:     sort by bid_amount DESC, then waiver_priority.priority_position ASC (tiebreak)
 *
 * Auth: Bearer CRON_SECRET (Vercel) or admin session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'whb21burton@gmail.com';

export async function POST(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const results: Record<string, unknown>[] = [];

  // 1. Get all active season leagues
  const { data: leagues } = await admin
    .from('leagues')
    .select('id, settings, status')
    .eq('status', 'active')
    .eq('league_type', 'season');

  for (const league of leagues ?? []) {
    const leagueId  = league.id;
    const waiverType = league.settings?.waiver_type ?? 'rolling';

    // 2. Get pending claims for this league
    const { data: pendingClaims } = await admin
      .from('waiver_claims')
      .select('*')
      .eq('league_id', leagueId)
      .eq('status', 'pending');

    if (!pendingClaims || pendingClaims.length === 0) continue;

    // 3. Get waiver priority for this league
    const { data: priorityRows } = await admin
      .from('waiver_priority')
      .select('user_id, priority_position')
      .eq('league_id', leagueId)
      .order('priority_position', { ascending: true });

    const priorityMap = new Map<string, number>();
    for (const row of priorityRows ?? []) priorityMap.set(row.user_id, row.priority_position);

    // 4. Sort claims
    const sorted = [...pendingClaims].sort((a, b) => {
      if (waiverType === 'faab') {
        // Highest bid first; tiebreak by priority position
        if (b.bid_amount !== a.bid_amount) return b.bid_amount - a.bid_amount;
        return (priorityMap.get(a.user_id) ?? 999) - (priorityMap.get(b.user_id) ?? 999);
      } else {
        // Rolling: lower priority_position first, then claim priority_rank
        const pA = priorityMap.get(a.user_id) ?? 999;
        const pB = priorityMap.get(b.user_id) ?? 999;
        if (pA !== pB) return pA - pB;
        return a.priority_rank - b.priority_rank;
      }
    });

    // 5. Track which add_unit_ids have been awarded this run (first come first served)
    const awardedUnits = new Set<string>();
    const leagueResults: unknown[] = [];

    for (const claim of sorted) {
      const { id: claimId, user_id, add_unit_id, drop_unit_id, bid_amount } = claim;

      // Check if add_unit already taken this run
      if (awardedUnits.has(add_unit_id)) {
        await admin.from('waiver_claims').update({ status: 'failed', processed_at: new Date().toISOString() }).eq('id', claimId);
        leagueResults.push({ claim: claimId, status: 'failed', reason: 'unit already awarded' });
        continue;
      }

      // Check add_unit is not on any roster (not in draft_picks for this league)
      const { data: existing } = await admin
        .from('draft_picks')
        .select('id')
        .eq('league_id', leagueId)
        .filter('player_data->>school', 'eq', add_unit_id.split('_')[0] ?? '')
        .filter('player_data->>unitType', 'eq', add_unit_id.split('_')[1] ?? '')
        .maybeSingle();

      if (existing) {
        await admin.from('waiver_claims').update({ status: 'failed', processed_at: new Date().toISOString() }).eq('id', claimId);
        leagueResults.push({ claim: claimId, status: 'failed', reason: 'unit already on a roster' });
        continue;
      }

      // Check user still has the drop unit (if required)
      if (drop_unit_id) {
        const [dropSchool, dropType] = drop_unit_id.split('_');
        const { data: dropPick } = await admin
          .from('draft_picks')
          .select('id')
          .eq('league_id', leagueId)
          .eq('user_id', user_id)
          .filter('player_data->>school', 'eq', dropSchool ?? '')
          .filter('player_data->>unitType', 'eq', dropType ?? '')
          .maybeSingle();

        if (!dropPick) {
          await admin.from('waiver_claims').update({ status: 'failed', processed_at: new Date().toISOString() }).eq('id', claimId);
          leagueResults.push({ claim: claimId, status: 'failed', reason: 'drop unit no longer on roster' });
          continue;
        }

        // Drop the unit
        await admin.from('draft_picks').delete().eq('id', dropPick.id);
      }

      // Check FAAB balance
      if (waiverType === 'faab' && bid_amount > 0) {
        const { data: faab } = await admin
          .from('faab_balances')
          .select('remaining_budget')
          .eq('league_id', leagueId)
          .eq('user_id', user_id)
          .maybeSingle();
        const budget = faab?.remaining_budget ?? (league.settings?.faab_budget ?? 100);
        if (bid_amount > budget) {
          await admin.from('waiver_claims').update({ status: 'failed', processed_at: new Date().toISOString() }).eq('id', claimId);
          leagueResults.push({ claim: claimId, status: 'failed', reason: 'insufficient FAAB' });
          continue;
        }
        // Deduct bid
        await admin.from('faab_balances').upsert(
          { league_id: leagueId, user_id, remaining_budget: budget - bid_amount, updated_at: new Date().toISOString() },
          { onConflict: 'league_id,user_id' }
        );
      }

      // Add the unit to draft_picks
      const [addSchool, addType] = add_unit_id.split('_');
      const { data: leagueRow } = await admin.from('leagues').select('current_week').eq('id', leagueId).single();
      await admin.from('draft_picks').insert({
        league_id: leagueId,
        user_id,
        player_id: `${(addSchool ?? '').toLowerCase()}-${(addType ?? '').toLowerCase()}`,
        player_data: {
          school:    addSchool,
          unitType:  addType,
          _slot:     'WAIVER',
          _pickup_week: leagueRow?.current_week ?? 0,
        },
        round:       99,
        pick_number: 99999,
        week:        leagueRow?.current_week ?? 0,
        entry_type:  'pickup',
        picked_at:   new Date().toISOString(),
      });

      // Mark claim awarded
      await admin.from('waiver_claims').update({ status: 'awarded', processed_at: new Date().toISOString() }).eq('id', claimId);
      awardedUnits.add(add_unit_id);

      // Cancel other pending claims for same add_unit from same user
      await admin.from('waiver_claims')
        .update({ status: 'cancelled', processed_at: new Date().toISOString() })
        .eq('league_id', leagueId)
        .eq('user_id', user_id)
        .eq('add_unit_id', add_unit_id)
        .eq('status', 'pending')
        .neq('id', claimId);

      // Rolling: move this user to bottom of priority
      if (waiverType === 'rolling') {
        const maxPos = Math.max(...Array.from(priorityMap.values()), 0);
        await admin.from('waiver_priority')
          .upsert({ league_id: leagueId, user_id, priority_position: maxPos + 1, updated_at: new Date().toISOString() },
                  { onConflict: 'league_id,user_id' });
        priorityMap.set(user_id, maxPos + 1);
      }

      leagueResults.push({ claim: claimId, status: 'awarded', add_unit_id, user_id });
    }

    results.push({ league_id: leagueId, claims_processed: leagueResults.length, results: leagueResults });
  }

  return NextResponse.json({ success: true, leagues_processed: results.length, results });
}
