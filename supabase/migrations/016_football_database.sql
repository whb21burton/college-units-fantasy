-- 016_football_database.sql
-- Comprehensive college football database
-- Strategy: cache everything locally, minimize CFBD API calls
-- Pull schedule: CFBD calls are fixed regardless of user count

-- ── team_info ─────────────────────────────────────────────────────────────────
-- Stores once per team, never changes year to year
-- Replaces/extends cached_teams with full team metadata
CREATE TABLE IF NOT EXISTS public.team_info (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school            text        NOT NULL UNIQUE,
  cfbd_id           integer,
  abbreviation      text,
  mascot            text,
  primary_color     text,
  secondary_color   text,
  logo_url          text,
  conference        text,
  division          text        NOT NULL DEFAULT 'FBS'
                                CHECK (division IN ('FBS','FCS')),
  stadium_name      text,
  stadium_capacity  integer,
  city              text,
  state             text,
  is_active         boolean     NOT NULL DEFAULT true,
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_info_conference_idx ON public.team_info(conference);
CREATE INDEX IF NOT EXISTS team_info_division_idx   ON public.team_info(division);

ALTER TABLE public.team_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_info_read" ON public.team_info FOR SELECT USING (true);
CREATE POLICY "team_info_svc"  ON public.team_info FOR ALL   USING (true);

-- ── season_rosters ────────────────────────────────────────────────────────────
-- One row per player per season
-- depth_rank: 1=starter, 2=backup, 3=third string
-- injury_status: null=healthy, 'Q'=questionable, 'O'=out, 'IR'=injured reserve
CREATE TABLE IF NOT EXISTS public.season_rosters (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school           text    NOT NULL,
  season           integer NOT NULL,
  player_name      text    NOT NULL,
  position         text    NOT NULL CHECK (position IN ('QB','RB','WR','TE','K','DEF')),
  depth_rank       integer NOT NULL DEFAULT 1 CHECK (depth_rank IN (1,2,3)),
  jersey_number    text,
  year_in_school   text    CHECK (year_in_school IN ('FR','SO','JR','SR','GR') OR year_in_school IS NULL),
  injury_status    text    CHECK (injury_status IN ('Q','O','IR') OR injury_status IS NULL),
  height           text,
  weight           integer,
  hometown         text,
  home_state       text,
  stars            integer CHECK (stars BETWEEN 1 AND 5 OR stars IS NULL),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (school, season, player_name, position)
);

CREATE INDEX IF NOT EXISTS season_rosters_school_idx    ON public.season_rosters(school, season);
CREATE INDEX IF NOT EXISTS season_rosters_position_idx  ON public.season_rosters(position, season);
CREATE INDEX IF NOT EXISTS season_rosters_injury_idx    ON public.season_rosters(injury_status) WHERE injury_status IS NOT NULL;

ALTER TABLE public.season_rosters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_rosters_read" ON public.season_rosters FOR SELECT USING (true);
CREATE POLICY "season_rosters_svc"  ON public.season_rosters FOR ALL   USING (true);

-- ── live_game_status ──────────────────────────────────────────────────────────
-- Updated every 5 minutes on game days via sync-live-stats cron
-- Drives live scoring updates pushed to users via Supabase realtime
CREATE TABLE IF NOT EXISTS public.live_game_status (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       text    NOT NULL UNIQUE,
  season        integer NOT NULL,
  week          integer NOT NULL,
  home_team     text    NOT NULL,
  away_team     text    NOT NULL,
  home_score    integer NOT NULL DEFAULT 0,
  away_score    integer NOT NULL DEFAULT 0,
  period        integer,            -- 1-4, 5=OT
  clock         text,               -- e.g. '7:42'
  status        text    NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','in_progress','halftime','final')),
  possession    text,               -- school name that has the ball
  last_play     text,               -- description of last play
  last_updated  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_game_status_week_idx    ON public.live_game_status(week, season);
CREATE INDEX IF NOT EXISTS live_game_status_status_idx  ON public.live_game_status(status);
CREATE INDEX IF NOT EXISTS live_game_status_teams_idx   ON public.live_game_status(home_team, away_team);

ALTER TABLE public.live_game_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_game_read" ON public.live_game_status FOR SELECT USING (true);
CREATE POLICY "live_game_svc"  ON public.live_game_status FOR ALL   USING (true);

-- ── recruiting_news ───────────────────────────────────────────────────────────
-- Transfer portal + recruiting commits, updated weekly
-- Shown in news feed on home page, filterable by conference/team
CREATE TABLE IF NOT EXISTS public.recruiting_news (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  season        integer NOT NULL,
  type          text    NOT NULL CHECK (type IN ('recruit','transfer')),
  player_name   text    NOT NULL,
  position      text,
  stars         integer CHECK (stars BETWEEN 1 AND 5 OR stars IS NULL),
  rating        numeric,           -- composite recruiting rating 0-1
  from_school   text,              -- null for high school recruits
  to_school     text,
  from_conf     text,
  to_conf       text,
  status        text    NOT NULL DEFAULT 'committed'
                        CHECK (status IN ('committed','decommitted','enrolled','transfer_portal','signed')),
  commit_date   date,
  hometown      text,
  home_state    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recruiting_season_idx   ON public.recruiting_news(season);
CREATE INDEX IF NOT EXISTS recruiting_to_school_idx ON public.recruiting_news(to_school);
CREATE INDEX IF NOT EXISTS recruiting_to_conf_idx   ON public.recruiting_news(to_conf);
CREATE INDEX IF NOT EXISTS recruiting_type_idx      ON public.recruiting_news(type);
CREATE INDEX IF NOT EXISTS recruiting_status_idx    ON public.recruiting_news(status);

ALTER TABLE public.recruiting_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recruiting_read" ON public.recruiting_news FOR SELECT USING (true);
CREATE POLICY "recruiting_svc"  ON public.recruiting_news FOR ALL   USING (true);

-- ── season_history ────────────────────────────────────────────────────────────
-- End-of-season snapshot per team per unit per year
-- Users can browse historical performance year over year
CREATE TABLE IF NOT EXISTS public.season_history (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school          text    NOT NULL,
  season          integer NOT NULL,
  unit_type       text    NOT NULL CHECK (unit_type IN ('QB','RB','WR','TE','DEF','K')),
  total_pts       numeric NOT NULL DEFAULT 0,
  avg_per_week    numeric NOT NULL DEFAULT 0,
  weeks_played    integer NOT NULL DEFAULT 0,
  best_week_pts   numeric,
  best_week       integer,
  final_off_rank  integer,
  final_def_rank  integer,
  final_elo_rank  integer,
  bowl_game       text,
  record_wins     integer,
  record_losses   integer,
  snapshot_at     timestamptz DEFAULT now(),
  UNIQUE (school, season, unit_type)
);

CREATE INDEX IF NOT EXISTS season_history_school_idx  ON public.season_history(school, season);
CREATE INDEX IF NOT EXISTS season_history_season_idx  ON public.season_history(season);

ALTER TABLE public.season_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_history_read" ON public.season_history FOR SELECT USING (true);
CREATE POLICY "season_history_svc"  ON public.season_history FOR ALL   USING (true);

-- ── Extend cached_teams with team_info columns ────────────────────────────────
-- Add missing columns to existing cached_teams table
ALTER TABLE public.cached_teams
  ADD COLUMN IF NOT EXISTS cfbd_id          integer,
  ADD COLUMN IF NOT EXISTS abbreviation     text,
  ADD COLUMN IF NOT EXISTS primary_color    text,
  ADD COLUMN IF NOT EXISTS secondary_color  text,
  ADD COLUMN IF NOT EXISTS stadium_name     text,
  ADD COLUMN IF NOT EXISTS stadium_capacity integer,
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS state            text,
  ADD COLUMN IF NOT EXISTS division         text DEFAULT 'FBS',
  ADD COLUMN IF NOT EXISTS is_active        boolean DEFAULT true;

-- ── Extend cached_players with depth ranking and injury ───────────────────────
ALTER TABLE public.cached_players
  ADD COLUMN IF NOT EXISTS depth_rank    integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS injury_status text
    CHECK (injury_status IN ('Q','O','IR') OR injury_status IS NULL),
  ADD COLUMN IF NOT EXISTS season        integer,
  ADD COLUMN IF NOT EXISTS stars         integer,
  ADD COLUMN IF NOT EXISTS height        text,
  ADD COLUMN IF NOT EXISTS weight        integer;

-- ── Extend cached_stats with live flag ───────────────────────────────────────
-- is_live = true means written during an in-progress game (may be updated)
-- is_live = false/null means final
ALTER TABLE public.cached_stats
  ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS cached_stats_live_idx
  ON public.cached_stats(is_live, week, season) WHERE is_live = true;

-- ── Extend cached_schedule with start_time and status ────────────────────────
ALTER TABLE public.cached_schedule
  ADD COLUMN IF NOT EXISTS status     text DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS start_time timestamptz,
  ADD COLUMN IF NOT EXISTS venue      text,
  ADD COLUMN IF NOT EXISTS neutral    boolean DEFAULT false;
