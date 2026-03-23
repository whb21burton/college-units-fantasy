import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/deposit
 * Body: { amount_cents: number }  (integer cents, minimum 1000 = $10)
 *
 * 1. Creates a pending transaction record
 * 2. Creates Stripe Checkout with transaction_id in metadata
 * 3. Returns { url }
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

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Get current balance for balance_before
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const balanceBefore = wallet?.balance ?? 0;

    // Create pending transaction — will be completed by webhook
    const { data: tx, error: txErr } = await admin
      .from('transactions')
      .insert({
        user_id:        user.id,
        type:           'deposit',
        amount:         amount_cents,
        balance_before: balanceBefore,
        balance_after:  balanceBefore,  // updated by webhook on completion
        status:         'pending',
        description:    `Deposit $${(amount_cents / 100).toFixed(2)}`,
      })
      .select('id')
      .single();

    if (txErr || !tx) {
      return NextResponse.json({ error: 'Failed to create transaction record' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'usd',
          product_data: {
            name:        'Wallet Deposit',
            description: `Add $${(amount_cents / 100).toFixed(2)} to your College Units Fantasy wallet`,
          },
          unit_amount: amount_cents,
        },
        quantity: 1,
      }],
      mode:        'payment',
      success_url: `${appUrl}/wallet?deposit=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/wallet?deposit=cancelled`,
      metadata: {
        user_id:        user.id,
        transaction_id: tx.id,
        amount_cents:   String(amount_cents),
        type:           'deposit',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[deposit]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to start checkout' }, { status: 500 });
  }
}
