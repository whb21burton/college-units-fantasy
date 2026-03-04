-- ── Efficiency System Migration ──────────────────────────────
-- Adds team_efficiency and school_matchups tables.
-- Extends weekly_scores and matchups with base/adjusted score columns.

-- Team efficiency: one row per school per week (locked after insert)
create table public.team_efficiency (
  id                    uuid default uuid_generate_v4() primary key,
  school                text not null,
  conference            text not null,
  week                  integer not null,
  season                integer not null,
  -- Offensive metrics (raw, season-rolling through this week)
  off_points_per_drive  numeric(8,4),
  off_yards_per_play    numeric(8,4),
  off_success_rate      numeric(8,4),
  off_turnover_rate     numeric(8,4),
  off_composite         numeric(8,4),   -- 0–1, average of 4 normalized metrics
  off_percentile        numeric(5,1),   -- 0–100
  -- Defensive metrics (raw)
  def_points_per_drive  numeric(8,4),
  def_yards_per_play    numeric(8,4),
  def_success_rate      numeric(8,4),
  def_turnover_rate     numeric(8,4),
  def_composite         numeric(8,4),
  def_percentile        numeric(5,1),
  -- Multipliers derived from percentile at calculation time (locked)
  off_multiplier        numeric(4,2) not null default 1.00,
  def_multiplier        numeric(4,2) not null default 1.00,
  calculated_at         timestamptz not null default now(),
  unique(school, week, season)
);

-- School matchups: CFBD schedule data (who plays who each week)
create table public.school_matchups (
  id            uuid default uuid_generate_v4() primary key,
  week          integer not null,
  season        integer not null,
  home_school   text not null,
  away_school   text not null,
  cfbd_game_id  bigint,
  start_time    timestamptz,
  completed     boolean not null default false,
  unique(week, season, cfbd_game_id)
);

-- Extend weekly_scores: track base vs adjusted
alter table public.weekly_scores
  add column if not exists base_score      numeric(8,2),
  add column if not exists adjusted_score  numeric(8,2),
  add column if not exists multiplier_used numeric(4,2) default 1.00;

-- Extend matchups: track base scores alongside adjusted
alter table public.matchups
  add column if not exists team1_base_score numeric(8,2),
  add column if not exists team2_base_score numeric(8,2);

-- Indexes
create index team_efficiency_week_season_idx on public.team_efficiency(week, season);
create index team_efficiency_school_idx on public.team_efficiency(school);
create index school_matchups_week_season_idx on public.school_matchups(week, season);

-- RLS: team_efficiency is public reference data (readable by all authenticated users)
alter table public.team_efficiency enable row level security;
create policy "Team efficiency readable by authenticated"
  on public.team_efficiency for select
  using (auth.role() = 'authenticated');

-- RLS: school_matchups is public reference data
alter table public.school_matchups enable row level security;
create policy "School matchups readable by authenticated"
  on public.school_matchups for select
  using (auth.role() = 'authenticated');
