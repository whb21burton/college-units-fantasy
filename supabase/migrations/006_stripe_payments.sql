-- 006_stripe_payments.sql
-- Adds public league support, Stripe tracking on members, and a payouts table.

-- ── leagues ────────────────────────────────────────────────────────────────
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- ── league_members ─────────────────────────────────────────────────────────
-- paid may already exist from 005_wallet_system; guard with IF NOT EXISTS
ALTER TABLE league_members
  ADD COLUMN IF NOT EXISTS paid                      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id  text,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

-- ── payouts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payouts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id          uuid        NOT NULL REFERENCES leagues(id)     ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES auth.users(id),
  amount             integer     NOT NULL,   -- in cents
  stripe_transfer_id text,
  type               text        NOT NULL CHECK (type IN ('first_place','second_place')),
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Members can view their own payouts
CREATE POLICY "payouts_select_own" ON payouts
  FOR SELECT USING (user_id = auth.uid());

-- Commissioners can view payouts for their leagues
CREATE POLICY "payouts_select_commissioner" ON payouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leagues
      WHERE leagues.id = payouts.league_id
        AND leagues.commissioner_id = auth.uid()
    )
  );

-- Only service-role (webhooks / server actions) can insert
CREATE POLICY "payouts_insert_service" ON payouts
  FOR INSERT WITH CHECK (true);
