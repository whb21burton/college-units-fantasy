// POST /api/wallet/deposit/create
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createAdminClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';
import { getStateFromIP, checkStateRestriction, logComplianceEvent } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? '';
    const stateCode = await getStateFromIP(ip);
    if (stateCode) {
      const { restricted, stateName } = await checkStateRestriction(stateCode);
      if (restricted) {
        await logComplianceEvent(user.id, 'blocked_entry', { route: 'deposit/create', stateCode }, ip, req.headers.get('user-agent') ?? '');
        return NextResponse.json({
          error: `Cash contests and deposits are unavailable while you are located in ${stateName}. You may still access your account and withdraw funds.`,
          restricted: true,
          state_code: stateCode,
        }, { status: 403 });
      }
    }

    const body = await req.json();
    const { amountCents, chargeAmountCents } = body as { amountCents?: number; chargeAmountCents?: number };
    if (!amountCents || amountCents < 100) {
      return NextResponse.json({ error: 'Minimum deposit is $1 (100 cents)' }, { status: 400 });
    }
    const chargeAmount = chargeAmountCents ?? amountCents;

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

      if (newWallet) {
        await admin.from('ledger_accounts').insert([
          { wallet_id: newWallet.id, type: 'user_available', name: 'Available' },
          { wallet_id: newWallet.id, type: 'user_pending',   name: 'Pending' },
        ]);
      }
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

    console.log('[deposit/create] amountCents:', amountCents, 'chargeAmountCents:', chargeAmountCents, 'charging:', chargeAmount)

    // Create Stripe PaymentIntent — charge card full amount (deposit + fee), credit only deposit amount
    const paymentIntent = await stripe.paymentIntents.create({
      amount:               chargeAmount,
      currency:             'usd',
      customer:             stripeCustomerId,
      payment_method_types: ['card'],
      metadata:             { user_id: user.id, wallet_id: wallet.id, credit_amount_cents: String(amountCents) },
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
        description:              `Deposit via Stripe`,
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
