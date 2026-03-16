import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/connect/onboard
 *
 * Creates (or retrieves) a Stripe Connect Express account for the user,
 * stores the account ID on their league_member row, and returns the
 * Stripe-hosted onboarding URL.
 *
 * Body: { league_id: string }
 * Auth: Bearer token in Authorization header
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { league_id } = body as { league_id?: string };

  if (!league_id) {
    return NextResponse.json({ error: 'league_id is required' }, { status: 400 });
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

  // Load the member row so we can check for an existing connect account
  const { data: member } = await admin
    .from('league_members')
    .select('id, stripe_connect_account_id')
    .eq('league_id', league_id)
    .eq('user_id', user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });
  }

  let accountId: string = member.stripe_connect_account_id ?? '';

  // Create a new Express account if one doesn't exist yet
  if (!accountId) {
    const account = await stripe.accounts.create({
      type:  'express',
      email: user.email,
      metadata: {
        supabase_user_id: user.id,
        league_id,
      },
    });
    accountId = account.id;

    // Persist to both league_members and wallets (if the wallet table tracks it)
    await Promise.all([
      admin
        .from('league_members')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', member.id),
      admin
        .from('wallets')
        .update({ stripe_account_id: accountId })
        .eq('user_id', user.id),
    ]);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Generate a fresh account link every time (they expire quickly)
  const accountLink = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${appUrl}/league/${league_id}?connect=refresh`,
    return_url:  `${appUrl}/league/${league_id}?connect=success`,
    type:        'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
