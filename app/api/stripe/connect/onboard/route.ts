import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/connect/onboard
 *
 * Creates (or retrieves) a Stripe Connect Express account for the user,
 * stores it on profiles.stripe_connect_account_id, and returns the
 * Stripe-hosted onboarding URL.
 *
 * Auth: Bearer token in Authorization header
 */
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Check for existing connect account on profile
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_connect_account_id')
    .eq('id', user.id)
    .single();

  let accountId = profile?.stripe_connect_account_id ?? '';

  if (!accountId) {
    const account = await stripe.accounts.create({
      type:  'express',
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    accountId = account.id;

    await admin
      .from('profiles')
      .update({ stripe_connect_account_id: accountId })
      .eq('id', user.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const accountLink = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${appUrl}/wallet?connect=refresh`,
    return_url:  `${appUrl}/wallet?connect=success`,
    type:        'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
