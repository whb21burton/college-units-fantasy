-- 007_weekly_leagues.sql
-- Adds weekly pick'em contest support alongside season-long leagues.

-- ── league_type & week on leagues ──────────────────────────────────────────
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS league_type text NOT NULL DEFAULT 'season'
    CHECK (league_type IN ('season', 'weekly'));

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS week integer; -- NULL for season leagues, 1–14 for weekly

-- ── weekly_picks ────────────────────────────────────────────────────────────
-- One row per (league, user). Picks are stored as JSON:
--   { QB1: 'Georgia', RB1: 'Alabama', RB2: 'Texas', WR1: 'Ohio State',
--     WR2: 'Michigan', TE1: 'Penn State', DEF: 'Georgia', K: 'Clemson' }

CREATE TABLE IF NOT EXISTS weekly_picks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id),
  picks         jsonb       NOT NULL DEFAULT '{}',
  total_points  numeric(8,2),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(league_id, user_id)
);

ALTER TABLE weekly_picks ENABLE ROW LEVEL SECURITY;

-- All league members can read all picks (needed for leaderboard)
CREATE POLICY "weekly_picks_member_read" ON weekly_picks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_id = weekly_picks.league_id AND user_id = auth.uid()
    )
  );

-- Users can only write their own picks
CREATE POLICY "weekly_picks_own_insert" ON weekly_picks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "weekly_picks_own_update" ON weekly_picks
  FOR UPDATE USING (user_id = auth.uid());

-- Service role can update scores
CREATE POLICY "weekly_picks_service_update" ON weekly_picks
  FOR UPDATE USING (true);
