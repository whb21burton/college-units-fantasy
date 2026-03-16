-- ============================================================
-- WALLET SYSTEM — wallets, transactions, pools
-- ============================================================

-- ── WALLETS ──────────────────────────────────────────────────
-- One wallet per user, auto-created on signup
create table public.wallets (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  balance               numeric(10,2) not null default 0 check (balance >= 0),
  pending_balance       numeric(10,2) not null default 0 check (pending_balance >= 0),
  withdrawable_balance  numeric(10,2) not null default 0 check (withdrawable_balance >= 0),
  stripe_customer_id    text,          -- Stripe customer for saved payment methods
  stripe_account_id     text,          -- Stripe Connect Express account (for payouts)
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ── TRANSACTIONS ─────────────────────────────────────────────
create table public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  type                    text not null check (type in ('deposit', 'entry', 'payout', 'fee', 'refund', 'withdrawal')),
  amount                  numeric(10,2) not null,
  league_id               uuid references public.leagues(id) on delete set null,
  status                  text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  stripe_transfer_id      text,
  description             text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ── POOLS (prize escrow per league) ──────────────────────────
create table public.pools (
  league_id       uuid primary key references public.leagues(id) on delete cascade,
  total_amount    numeric(10,2) not null default 0,
  fee_amount      numeric(10,2) not null default 0,   -- platform's cut
  payout_amount   numeric(10,2) not null default 0,   -- goes to winner
  status          text not null default 'open' check (status in ('open', 'locked', 'paid_out')),
  winner_id       uuid references auth.users(id),
  paid_out_at     timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Add entry_fee to leagues if not already present ──────────
-- (buy_in exists but is integer cents; add entry_fee as numeric dollars)
alter table public.leagues
  add column if not exists entry_fee numeric(10,2) not null default 0;

-- ── RLS ──────────────────────────────────────────────────────
alter table public.wallets      enable row level security;
alter table public.transactions enable row level security;
alter table public.pools        enable row level security;

-- Wallets: users can only see and update their own wallet
create policy "wallets_read_own"
  on public.wallets for select
  using (auth.uid() = user_id);

create policy "wallets_insert_own"
  on public.wallets for insert
  with check (auth.uid() = user_id);

-- Transactions: users see only their own
create policy "transactions_read_own"
  on public.transactions for select
  using (auth.uid() = user_id);

-- Pools: visible to league members
create policy "pools_read_members"
  on public.pools for select
  using (exists (
    select 1 from public.league_members
    where league_id = pools.league_id and user_id = auth.uid()
  ));

-- ── Auto-create wallet on new user ───────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;
-- (trigger already exists from migration 001 — function replace is enough)

-- ── Wallet helper: debit (used server-side via service role) ─
create or replace function public.wallet_debit(
  p_user_id uuid,
  p_amount   numeric,
  p_type     text,
  p_league_id uuid default null,
  p_description text default null
)
returns uuid as $$
declare
  v_tx_id uuid;
begin
  -- Lock row and check balance
  perform 1 from public.wallets
    where user_id = p_user_id and balance >= p_amount
    for update;

  if not found then
    raise exception 'Insufficient balance';
  end if;

  update public.wallets
    set balance = balance - p_amount,
        updated_at = now()
    where user_id = p_user_id;

  insert into public.transactions (user_id, type, amount, league_id, status, description)
    values (p_user_id, p_type, -p_amount, p_league_id, 'completed', p_description)
    returning id into v_tx_id;

  return v_tx_id;
end;
$$ language plpgsql security definer;

-- ── Wallet helper: credit ─────────────────────────────────────
create or replace function public.wallet_credit(
  p_user_id    uuid,
  p_amount     numeric,
  p_type       text,
  p_league_id  uuid default null,
  p_description text default null,
  p_withdrawable boolean default false
)
returns uuid as $$
declare
  v_tx_id uuid;
begin
  insert into public.wallets (user_id, balance, withdrawable_balance)
    values (p_user_id, p_amount, case when p_withdrawable then p_amount else 0 end)
    on conflict (user_id) do update
      set balance              = wallets.balance + p_amount,
          withdrawable_balance = wallets.withdrawable_balance + (case when p_withdrawable then p_amount else 0 end),
          updated_at           = now();

  insert into public.transactions (user_id, type, amount, league_id, status, description)
    values (p_user_id, p_type, p_amount, p_league_id, 'completed', p_description)
    returning id into v_tx_id;

  return v_tx_id;
end;
$$ language plpgsql security definer;

-- ── Indexes ───────────────────────────────────────────────────
create index transactions_user_id_idx    on public.transactions(user_id);
create index transactions_league_id_idx  on public.transactions(league_id);
create index transactions_status_idx     on public.transactions(status);
create index transactions_stripe_pi_idx  on public.transactions(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index transactions_stripe_cs_idx  on public.transactions(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
