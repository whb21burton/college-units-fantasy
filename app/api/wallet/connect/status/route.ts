import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/connect/status
 *
 * Checks if the user's Stripe Connect account has completed onboarding.
 * If charges_enabled && payouts_enabled: sets stripe_connect_onboarded=true on profiles.
 */
export async function GET() {
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
      .select('stripe_connect_account_id, stripe_connect_onboarded')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_connect_account_id) {
      return NextResponse.json({ onboarded: false });
    }

    // Already marked onboarded — no need to re-check Stripe
    if (profile.stripe_connect_onboarded) {
      return NextResponse.json({ onboarded: true });
    }

    const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id);
    const onboarded = !!(account.charges_enabled && account.payouts_enabled);

    if (onboarded) {
      await admin
        .from('profiles')
        .update({ stripe_connect_onboarded: true })
        .eq('id', user.id);
    }

    return NextResponse.json({ onboarded });
  } catch (err: any) {
    console.error('[connect/status]', err);
    return NextResponse.json({ error: err?.message ?? 'Status check failed' }, { status: 500 });
  }
}
