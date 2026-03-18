-- 009_sports_cache.sql
-- Sports data cache: call CFBD once → store here → serve all users from here.
-- (User spec called this 005; renamed to 009 to avoid conflict with existing 005_wallet_system.sql)

-- ── cached_teams ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cached_teams (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school       text        NOT NULL UNIQUE,
  conference   text,
  mascot       text,
  logo_url     text,
  elo          numeric,
  elo_rank     integer,
  updated_at   timestamptz DEFAULT now()
);

-- ── cached_players ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cached_players (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school               text    NOT NULL,
  position             text    NOT NULL CHECK (position IN ('QB','RB','WR','TE','K','DEF')),
  player_name          text    NOT NULL,
  jersey_number        text,
  year                 text    CHECK (year IN ('FR','SO','JR','SR') OR year IS NULL),
  status               text    NOT NULL DEFAULT 'active' CHECK (status IN ('active','injured','out')),
  depth_chart_position integer,
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (school, position, player_name)
);

-- ── cached_scores ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cached_scores (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     text    NOT NULL UNIQUE,
  home_team   text    NOT NULL,
  away_team   text    NOT NULL,
  home_score  integer,
  away_score  integer,
  week        integer NOT NULL,
  season      integer NOT NULL,
  status      text    NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','in_progress','completed')),
  start_time  timestamptz,
  updated_at  timestamptz DEFAULT now()
);

-- ── cached_stats ─────────────────────────────────────────────────────────────
-- Stores both raw player stats and precomputed unit fantasy points.
-- stat_type examples:
--   player stats  : 'passing_YDS', 'passing_TD', 'passing_INT',
--                   'rushing_YDS', 'rushing_TD', 'rushing_ATT',
--                   'receiving_YDS', 'receiving_TD', 'receiving_REC',
--                   'kicking_PTS'
--   team stats    : 'team_rushingYards', 'team_rushingTDs', 'team_sacks',
--                   'team_passesIntercepted', 'team_fumblesRecovered',
--                   'team_interceptionTDs', 'team_fumbleReturnTDs'
--   unit totals   : 'unit_QB', 'unit_RB', 'unit_WR', 'unit_TE', 'unit_DEF', 'unit_K'
--                   (Elo-adjusted fantasy points for the whole unit)
CREATE TABLE IF NOT EXISTS public.cached_stats (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid    REFERENCES public.cached_players(id) ON DELETE SET NULL,
  game_id     text    NOT NULL,
  school      text    NOT NULL,
  player_name text,           -- denormalised; null for team/unit rows
  week        integer NOT NULL,
  season      integer NOT NULL,
  stat_type   text    NOT NULL,
  value       numeric NOT NULL DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (game_id, school, player_name, stat_type)
);

-- ── cached_schedule ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cached_schedule (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  week       integer NOT NULL,
  season     integer NOT NULL,
  home_team  text    NOT NULL,
  away_team  text    NOT NULL,
  game_date  timestamptz,
  game_id    text    NOT NULL UNIQUE,
  updated_at timestamptz DEFAULT now()
);

-- ── data_refresh_log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_refresh_log (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name        text    NOT NULL,
  status          text    NOT NULL CHECK (status IN ('success','failed')),
  records_updated integer NOT NULL DEFAULT 0,
  error_message   text,
  ran_at          timestamptz DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cached_players_school_idx    ON public.cached_players(school);
CREATE INDEX IF NOT EXISTS cached_players_position_idx  ON public.cached_players(position);
CREATE INDEX IF NOT EXISTS cached_scores_week_idx       ON public.cached_scores(week, season);
CREATE INDEX IF NOT EXISTS cached_scores_game_id_idx    ON public.cached_scores(game_id);
CREATE INDEX IF NOT EXISTS cached_scores_status_idx     ON public.cached_scores(status);
CREATE INDEX IF NOT EXISTS cached_stats_school_idx      ON public.cached_stats(school, week, season);
CREATE INDEX IF NOT EXISTS cached_stats_game_id_idx     ON public.cached_stats(game_id);
CREATE INDEX IF NOT EXISTS cached_stats_stat_type_idx   ON public.cached_stats(stat_type);
CREATE INDEX IF NOT EXISTS cached_schedule_week_idx     ON public.cached_schedule(week, season);
CREATE INDEX IF NOT EXISTS cached_schedule_team_idx     ON public.cached_schedule(home_team, away_team);
CREATE INDEX IF NOT EXISTS data_refresh_log_job_idx     ON public.data_refresh_log(job_name, ran_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.cached_teams     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cached_players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cached_scores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cached_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cached_schedule  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_refresh_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all cache tables
CREATE POLICY "cache_teams_read"    ON public.cached_teams     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cache_players_read"  ON public.cached_players   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cache_scores_read"   ON public.cached_scores    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cache_stats_read"    ON public.cached_stats     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cache_schedule_read" ON public.cached_schedule  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cache_log_read"      ON public.data_refresh_log FOR SELECT USING (auth.role() = 'authenticated');

-- Service role can write everything (cron jobs use service-role client)
CREATE POLICY "cache_teams_svc"     ON public.cached_teams     FOR ALL USING (true);
CREATE POLICY "cache_players_svc"   ON public.cached_players   FOR ALL USING (true);
CREATE POLICY "cache_scores_svc"    ON public.cached_scores    FOR ALL USING (true);
CREATE POLICY "cache_stats_svc"     ON public.cached_stats     FOR ALL USING (true);
CREATE POLICY "cache_schedule_svc"  ON public.cached_schedule  FOR ALL USING (true);
CREATE POLICY "cache_log_svc"       ON public.data_refresh_log FOR ALL USING (true);
