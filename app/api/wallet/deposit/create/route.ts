// POST /api/wallet/deposit/create
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { amountCents } = body as { amountCents?: number };
    if (!amountCents || amountCents < 500) {
      return NextResponse.json({ error: 'Minimum deposit is $5 (500 cents)' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Get or create wallet
    let { data: wallet } = await admin
      .from('wallets')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!wallet) {
      const { data: newWallet } = await admin
        .from('wallets')
        .insert({ user_id: user.id })
        .select('id, stripe_customer_id')
        .single();
      wallet = newWallet;
    }

    if (!wallet) return NextResponse.json({ error: 'Failed to get wallet' }, { status: 500 });

    // Get or create Stripe customer
    let stripeCustomerId = wallet.stripe_customer_id as string | null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      stripeCustomerId = customer.id;
      await admin.from('wallets').update({ stripe_customer_id: stripeCustomerId }).eq('id', wallet.id);
    }

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: 'usd',
      customer: stripeCustomerId,
      metadata: { wallet_id: wallet.id, user_id: user.id },
    });

    // Insert deposit row
    const { data: deposit, error: depositErr } = await admin
      .from('deposits')
      .insert({
        wallet_id:                wallet.id,
        user_id:                  user.id,
        amount_cents:             amountCents,
        status:                   'pending',
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select('id')
      .single();

    if (depositErr) throw depositErr;

    // Insert transaction row
    const { data: transaction, error: txErr } = await admin
      .from('transactions')
      .insert({
        wallet_id:       wallet.id,
        user_id:         user.id,
        type:            'deposit',
        status:          'pending',
        amount_cents:    amountCents,
        description:     `Deposit $${(amountCents / 100).toFixed(2)}`,
        idempotency_key: `deposit_${paymentIntent.id}`,
        reference_id:    deposit!.id,
      })
      .select('id')
      .single();

    if (txErr) throw txErr;

    return NextResponse.json({
      clientSecret:  paymentIntent.client_secret,
      depositId:     deposit!.id,
      transactionId: transaction!.id,
    });
  } catch (err: any) {
    console.error('[deposit/create]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
