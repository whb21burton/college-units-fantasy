import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/deposit
 * Body: { amount: number }  (dollars, e.g. 20)
 *
 * Creates a Stripe Checkout Session. The client redirects to the Stripe
 * hosted page; on success the webhook credits the wallet.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || amount < 5 || amount > 10000) {
      return NextResponse.json({ error: 'Amount must be between $5 and $10,000' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    // Get or create Stripe customer so we can save payment methods
    let stripeCustomerId: string | null = null;
    const { data: wallet } = await supabase
      .from('wallets')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (wallet?.stripe_customer_id) {
      stripeCustomerId = wallet.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await supabase
        .from('wallets')
        .upsert({ user_id: user.id, stripe_customer_id: stripeCustomerId });
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Wallet Deposit',
            description: `Add $${amount.toFixed(2)} to your College Units Fantasy wallet`,
          },
          unit_amount: Math.round(amount * 100), // cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${appUrl}/?deposit=success&amount=${amount}`,
      cancel_url:  `${appUrl}/?deposit=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        deposit_amount:   String(amount),
      },
    });

    // Record pending transaction (best-effort — don't block on failure)
    await supabase.from('transactions').insert({
      user_id:                    user.id,
      type:                       'deposit',
      amount,
      status:                     'pending',
      stripe_checkout_session_id: session.id,
      description:                `Deposit via Stripe`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[deposit] error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Failed to create checkout session' },
      { status: 500 },
    );
  }
}
