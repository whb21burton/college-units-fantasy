import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/connect/onboard
 *
 * Creates or retrieves a Stripe Connect Express account, saves to profiles,
 * and returns the Stripe-hosted onboarding URL.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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
      refresh_url: `${appUrl}/wallet/connect/refresh`,
      return_url:  `${appUrl}/wallet/connect/return`,
      type:        'account_onboarding',
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err: any) {
    console.error('[connect/onboard]', err);
    return NextResponse.json({ error: err?.message ?? 'Onboarding failed' }, { status: 500 });
  }
}
