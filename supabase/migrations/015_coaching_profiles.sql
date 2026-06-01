-- Team coaching profiles: head coach, OC, offensive style
-- Populated by /api/cron/sync-coaching-profiles
CREATE TABLE IF NOT EXISTS team_coaching_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school        text NOT NULL,
  season        int  NOT NULL,
  head_coach    text,
  hc_philosophy text, -- 'offensive' | 'defensive' | 'balanced'
  off_coordinator text,
  pass_rate     numeric, -- 0-100, percent of plays that are passes
  rush_rate     numeric, -- 0-100
  explosiveness numeric, -- CFBD advanced stat
  tempo         text,    -- 'fast' | 'normal' | 'slow'
  plays_per_game numeric,
  aggressiveness_score numeric, -- 0-10 calculated
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(school, season)
);

ALTER TABLE team_coaching_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read coaching profiles"
  ON team_coaching_profiles FOR SELECT USING (true);
