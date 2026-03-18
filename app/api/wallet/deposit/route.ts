import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

const VALID_AMOUNTS_CENTS = new Set([1000, 2500, 5000, 10000, 25000]);

/**
 * POST /api/wallet/deposit
 * Body: { amount_cents: number }
 *
 * Valid preset amounts (cents): 1000 ($10), 2500 ($25), 5000 ($50),
 *   10000 ($100), 25000 ($250). Custom: any integer >= 1000.
 *
 * Creates a Stripe Checkout Session. Webhook credits wallet on success.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const amount_cents = Math.round(Number(body.amount_cents));

    if (!amount_cents || amount_cents < 1000) {
      return NextResponse.json({ error: 'Minimum deposit is $10' }, { status: 400 });
    }
    if (amount_cents > 2_500_000) {
      return NextResponse.json({ error: 'Maximum deposit is $25,000' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const dollars = (amount_cents / 100).toFixed(2);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name:        'Wallet Deposit',
            description: `Add $${dollars} to your College Units Fantasy wallet`,
          },
          unit_amount: amount_cents,
        },
        quantity: 1,
      }],
      mode:        'payment',
      success_url: `${appUrl}/wallet?deposit=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/wallet?deposit=cancelled`,
      metadata: {
        user_id:      user.id,
        amount_cents: String(amount_cents),
        type:         'deposit',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[deposit]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Failed to create checkout session' },
      { status: 500 },
    );
  }
}
