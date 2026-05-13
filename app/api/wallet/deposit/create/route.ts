// POST /api/wallet/deposit/create
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // Temp debug — remove after fixing
    console.log('[deposit/create] ENV CHECK:', {
      hasServiceKey:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceKeyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20),
      hasStripeKey:     !!process.env.STRIPE_SECRET_KEY,
      stripeKeyPrefix:  process.env.STRIPE_SECRET_KEY?.slice(0, 10),
      hasSupabaseUrl:   !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    });

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

    if (depositErr) {
      console.error('[deposit/create] deposits insert failed:', depositErr.message, depositErr.code);
      return NextResponse.json({ error: 'deposits insert failed', message: depositErr.message, code: depositErr.code }, { status: 500 });
    }

    // Insert transaction row
    const { data: transaction, error: txErr } = await admin
      .from('transactions')
      .insert({
        user_id:                  user.id,
        type:                     'deposit',
        status:                   'pending',
        amount_cents:             amountCents,
        stripe_payment_intent_id: paymentIntent.id,
        description:              `Deposit $${(amountCents / 100).toFixed(2)}`,
        idempotency_key:          `deposit_${paymentIntent.id}`,
      })
      .select('id')
      .single();

    if (txErr) {
      console.error('[deposit/create] transactions insert failed:', txErr.message, txErr.code);
      return NextResponse.json({ error: 'transactions insert failed', message: txErr.message, code: txErr.code }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret:  paymentIntent.client_secret,
      depositId:     deposit!.id,
      transactionId: transaction!.id,
    });
  } catch (err: any) {
    console.error('[deposit/create] UNHANDLED:', err?.message, err?.code, err?.stack?.slice(0, 200));
    return NextResponse.json({
      error:   'deposit failed',
      message: err?.message,
      code:    err?.code,
    }, { status: 500 });
  }
}
