-- 010_wallet_functions.sql
-- Atomic balance RPCs + stripe_connect_onboarded flag on profiles

-- ── stripe_connect_onboarded on profiles ─────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded boolean NOT NULL DEFAULT false;

-- ── deduct_balance ────────────────────────────────────────────────────────────
-- Atomically checks balance >= amount, deducts, returns new balance.
-- Raises exception on insufficient funds (caller catches as 402).
CREATE OR REPLACE FUNCTION public.deduct_balance(p_user_id uuid, p_amount integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance integer;
  v_new     integer;
BEGIN
  SELECT balance INTO v_balance
  FROM   public.wallets
  WHERE  user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: have %, need %', v_balance, p_amount;
  END IF;

  v_new := v_balance - p_amount;

  UPDATE public.wallets
  SET    balance    = v_new,
         updated_at = now()
  WHERE  user_id = p_user_id;

  RETURN v_new;
END;
$$;

-- ── add_balance ───────────────────────────────────────────────────────────────
-- Atomically adds to balance. Creates wallet row if missing.
-- Returns new balance.
CREATE OR REPLACE FUNCTION public.add_balance(p_user_id uuid, p_amount integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new integer;
BEGIN
  INSERT INTO public.wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = wallets.balance + p_amount,
        updated_at = now()
  RETURNING balance INTO v_new;

  RETURN v_new;
END;
$$;
