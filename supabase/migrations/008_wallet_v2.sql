-- 008_wallet_v2.sql
-- DraftKings-style wallet: all amounts in CENTS (integer).
-- Replaces the earlier numeric-dollar wallet from 005.

-- ── Drop old tables (safe in dev — no real money yet) ────────────────────────
DROP TABLE IF EXISTS public.payouts          CASCADE;
DROP TABLE IF EXISTS public.contest_entries  CASCADE;
DROP TABLE IF EXISTS public.transactions     CASCADE;
DROP TABLE IF EXISTS public.wallets          CASCADE;
DROP TABLE IF EXISTS public.pools            CASCADE;

-- ── wallets ──────────────────────────────────────────────────────────────────
CREATE TABLE public.wallets (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid    NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance             integer NOT NULL DEFAULT 0 CHECK (balance >= 0),  -- cents
  lifetime_deposited  integer NOT NULL DEFAULT 0,
  lifetime_withdrawn  integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ── transactions ─────────────────────────────────────────────────────────────
CREATE TABLE public.transactions (
  id                         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                       text    NOT NULL CHECK (type IN (
                               'deposit','withdrawal','contest_entry',
                               'contest_refund','winnings')),
  amount                     integer NOT NULL,          -- cents, always positive
  balance_before             integer NOT NULL DEFAULT 0,
  balance_after              integer NOT NULL DEFAULT 0,
  league_id                  uuid    REFERENCES public.leagues(id) ON DELETE SET NULL,
  stripe_payment_intent_id   text,
  stripe_transfer_id         text,
  status                     text    NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','completed','failed','refunded')),
  description                text,
  created_at                 timestamptz DEFAULT now()
);

-- ── contest_entries ───────────────────────────────────────────────────────────
CREATE TABLE public.contest_entries (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id      uuid    NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  amount_paid    integer NOT NULL,   -- cents
  transaction_id uuid    REFERENCES public.transactions(id),
  status         text    NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','cancelled','completed')),
  created_at     timestamptz DEFAULT now(),
  UNIQUE(user_id, league_id)
);

-- ── payouts ───────────────────────────────────────────────────────────────────
CREATE TABLE public.payouts (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id          uuid    NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id            uuid    NOT NULL REFERENCES auth.users(id),
  place              integer NOT NULL CHECK (place IN (1, 2)),
  amount             integer NOT NULL,   -- cents
  transaction_id     uuid    REFERENCES public.transactions(id),
  stripe_transfer_id text,
  status             text    NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','completed','failed')),
  created_at         timestamptz DEFAULT now()
);

-- ── stripe_connect_account_id on profiles ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

-- ── stripe_checkout_session_id on league_members ─────────────────────────────
ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS paid boolean DEFAULT false;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.wallets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_own_read"          ON public.wallets
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "transactions_own_read"     ON public.transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "contest_entries_own_read"  ON public.contest_entries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "payouts_own_read"          ON public.payouts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "payouts_commissioner_read" ON public.payouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leagues
      WHERE id = payouts.league_id AND commissioner_id = auth.uid()
    )
  );

-- Service role can write everything (used by API routes with admin client)
CREATE POLICY "wallets_service_all"         ON public.wallets         FOR ALL USING (true);
CREATE POLICY "transactions_service_all"    ON public.transactions     FOR ALL USING (true);
CREATE POLICY "contest_entries_service_all" ON public.contest_entries  FOR ALL USING (true);
CREATE POLICY "payouts_service_all"         ON public.payouts          FOR ALL USING (true);

-- ── Auto-create wallet on profile insert ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_wallet_for_new_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_wallet ON public.profiles;
CREATE TRIGGER on_profile_created_wallet
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_new_profile();

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS tx_user_id_idx    ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS tx_league_id_idx  ON public.transactions(league_id);
CREATE INDEX IF NOT EXISTS tx_status_idx     ON public.transactions(status);
CREATE INDEX IF NOT EXISTS ce_league_id_idx  ON public.contest_entries(league_id);
