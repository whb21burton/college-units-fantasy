import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout session for a league entry fee.
 * Charge = buy_in + 10% platform fee  (e.g. $10 → $11.00)
 *
 * Body: { league_id: string; team_name: string }
 * Auth: user must be signed in (reads user from Supabase auth header)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { league_id, team_name } = body as { league_id?: string; team_name?: string };

  if (!league_id || !team_name?.trim()) {
    return NextResponse.json({ error: 'league_id and team_name are required' }, { status: 400 });
  }

  // Auth: pull the user from the bearer token
  const authHeader = req.headers.get('authorization') ?? '';
  const token      = authHeader.replace('Bearer ', '').trim();

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Load league
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: league, error: leagueErr } = await admin
    .from('leagues')
    .select('id, name, buy_in, league_size, status')
    .eq('id', league_id)
    .single();

  if (leagueErr || !league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }
  if (league.status !== 'forming') {
    return NextResponse.json({ error: 'League is not accepting entries' }, { status: 400 });
  }
  if (!league.buy_in || league.buy_in <= 0) {
    return NextResponse.json({ error: 'This league is free — no payment required' }, { status: 400 });
  }

  // Check not already a member
  const { data: existing } = await admin
    .from('league_members')
    .select('id, paid')
    .eq('league_id', league_id)
    .eq('user_id', user.id)
    .single();

  if (existing?.paid) {
    return NextResponse.json({ error: 'Already paid for this league' }, { status: 409 });
  }

  // Check league is not full
  const { count: memberCount } = await admin
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league_id);

  if ((memberCount ?? 0) >= league.league_size) {
    return NextResponse.json({ error: 'League is full' }, { status: 400 });
  }

  // Amount in cents: buy_in dollars + 10% fee
  const buyInCents  = league.buy_in * 100;
  const feeCents    = Math.round(buyInCents * 0.10);
  const totalCents  = buyInCents + feeCents;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode:                'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency:     'usd',
          unit_amount:  totalCents,
          product_data: {
            name:        `${league.name} — Entry Fee`,
            description: `$${league.buy_in} buy-in + $${(feeCents / 100).toFixed(2)} platform fee`,
          },
        },
      },
    ],
    metadata: {
      checkout_type: 'league_entry',
      league_id,
      user_id:       user.id,
      team_name:     team_name.trim(),
      buy_in_amount: String(league.buy_in),
    },
    success_url: `${appUrl}/league/${league_id}?payment=success`,
    cancel_url:  `${appUrl}/join/${league_id}?payment=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
