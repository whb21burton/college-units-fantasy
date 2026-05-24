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
    if (!amountCents || amountCents < 100) {
      return NextResponse.json({ error: 'Minimum deposit is $1 (100 cents)' }, { status: 400 });
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

    // Non-blocking fraud log
    admin.from('compliance_logs').insert({
      user_id:    user.id,
      event_type: 'deposit_initiated',
      event_data: {
        amount_cents: amountCents,
        ip:           req.headers.get('x-forwarded-for') ?? 'unknown',
      },
      ip_address: req.headers.get('x-forwarded-for') ?? 'unknown',
      user_agent: req.headers.get('user-agent') ?? 'unknown',
    }).then(() => {})

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount:               amountCents,
      currency:             'usd',
      customer:             stripeCustomerId,
      payment_method_types: ['card'],
      metadata:             { user_id: user.id, wallet_id: wallet.id },
    });

    // Insert deposit row (non-fatal if it fails — PaymentIntent already created)
    const { error: depositError } = await admin
      .from('deposits')
      .insert({
        user_id:                  user.id,
        amount_cents:             amountCents,
        stripe_payment_intent_id: paymentIntent.id,
        status:                   'pending',
      });

    if (depositError) {
      console.error('[deposit/create] deposits insert error:', depositError.message, depositError.code);
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
      transactionId: transaction!.id,
    });
  } catch (err: any) {
    console.error('[deposit/create] Stripe error:', err?.message, err?.type, err?.code);
    return NextResponse.json({ error: err?.message ?? 'Stripe error' }, { status: 500 });
  }
}
