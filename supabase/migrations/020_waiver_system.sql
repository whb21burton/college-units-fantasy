CREATE TABLE IF NOT EXISTS public.waiver_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid,
  add_unit_id text NOT NULL,
  drop_unit_id text,
  priority_rank int DEFAULT 1,
  bid_amount int DEFAULT 0,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','awarded','failed','cancelled')),
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.waiver_priority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid,
  priority_position int NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faab_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid,
  remaining_budget int DEFAULT 100,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.waiver_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiver_priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faab_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view league waiver claims"
  ON public.waiver_claims FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own claims"
  ON public.waiver_claims FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own claims"
  ON public.waiver_claims FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view waiver priority"
  ON public.waiver_priority FOR SELECT
  USING (true);

CREATE POLICY "Users can view faab balances"
  ON public.faab_balances FOR SELECT
  USING (true);
