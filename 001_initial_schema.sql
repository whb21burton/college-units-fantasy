-- ============================================================
-- COLLEGE UNITS FANTASY — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── PROFILES ────────────────────────────────────────────────
-- Auto-created on signup via trigger below
create table public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz default now()
);

-- ── LEAGUES ─────────────────────────────────────────────────
create table public.leagues (
  id              uuid default uuid_generate_v4() primary key,
  name            text not null,
  commissioner_id uuid references auth.users(id) on delete set null,
  invite_code     text unique not null,
  buy_in          integer not null default 0,       -- dollars, 0 = free
  league_size     integer not null default 8,       -- 4/6/8/10/12
  draft_type      text not null default 'snake',    -- 'snake' | 'salary'
  salary_cap      integer not null default 200,
  status          text not null default 'forming',  -- 'forming' | 'drafting' | 'active' | 'playoffs' | 'complete'
  current_week    integer not null default 1,
  draft_order     uuid[] default '{}',              -- ordered user ids for draft
  settings        jsonb default '{}',               -- flex settings
  created_at      timestamptz default now()
);

-- ── LEAGUE MEMBERS ───────────────────────────────────────────
create table public.league_members (
  id          uuid default uuid_generate_v4() primary key,
  league_id   uuid references public.leagues(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  team_name   text not null,
  roster      jsonb default '[]',     -- array of player objects from draft pool
  paid        boolean default false,  -- buy-in paid via Stripe
  draft_slot  integer,                -- position in snake order (1-indexed)
  joined_at   timestamptz default now(),
  unique(league_id, user_id)
);

-- ── DRAFT PICKS ──────────────────────────────────────────────
create table public.draft_picks (
  id          uuid default uuid_generate_v4() primary key,
  league_id   uuid references public.leagues(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  player_id   text not null,          -- matches player.id from buildPool()
  player_data jsonb not null,         -- full player object snapshot
  round       integer not null,
  pick_number integer not null,       -- global pick number across all rounds
  picked_at   timestamptz default now(),
  unique(league_id, pick_number)
);

-- ── WEEKLY SCORES ────────────────────────────────────────────
create table public.weekly_scores (
  id          uuid default uuid_generate_v4() primary key,
  league_id   uuid references public.leagues(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  week        integer not null,
  score       numeric(8,2) not null default 0,
  calculated_at timestamptz default now(),
  unique(league_id, user_id, week)
);

-- ── MATCHUPS ─────────────────────────────────────────────────
create table public.matchups (
  id          uuid default uuid_generate_v4() primary key,
  league_id   uuid references public.leagues(id) on delete cascade not null,
  week        integer not null,
  team1_id    uuid references auth.users(id) on delete cascade not null,
  team2_id    uuid references auth.users(id),   -- null = BYE
  team1_score numeric(8,2) default 0,
  team2_score numeric(8,2) default 0,
  winner_id   uuid references auth.users(id),
  unique(league_id, week, team1_id)
);

-- ── PLAYOFF BRACKET ──────────────────────────────────────────
create table public.playoff_games (
  id          uuid default uuid_generate_v4() primary key,
  league_id   uuid references public.leagues(id) on delete cascade not null,
  week        integer not null,             -- 11=WildCard, 12=Semi, 13=Final
  round       text not null,               -- 'wildcard'|'semifinal'|'final'
  game_number integer not null,
  team1_id    uuid references auth.users(id),
  team2_id    uuid references auth.users(id),   -- null = BYE auto-advance
  team1_score numeric(8,2) default 0,
  team2_score numeric(8,2) default 0,
  winner_id   uuid references auth.users(id),
  unique(league_id, round, game_number)
);

-- ── INVITE CODES ─────────────────────────────────────────────
-- Invite codes are on the leagues table, but we track usage here
create table public.invite_uses (
  id          uuid default uuid_generate_v4() primary key,
  league_id   uuid references public.leagues(id) on delete cascade not null,
  used_by     uuid references auth.users(id) on delete cascade not null,
  used_at     timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.profiles       enable row level security;
alter table public.leagues         enable row level security;
alter table public.league_members  enable row level security;
alter table public.draft_picks     enable row level security;
alter table public.weekly_scores   enable row level security;
alter table public.matchups        enable row level security;
alter table public.playoff_games   enable row level security;
alter table public.invite_uses     enable row level security;

-- PROFILES: users can read all profiles, only edit own
create policy "profiles_read_all"   on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- LEAGUES: readable by members, created/edited by commissioner
create policy "leagues_read_member" on public.leagues for select
  using (
    commissioner_id = auth.uid()
    or exists (select 1 from public.league_members where league_id = id and user_id = auth.uid())
    or status = 'forming'  -- forming leagues visible so people can join via invite
  );
create policy "leagues_insert_auth"    on public.leagues for insert with check (auth.uid() is not null);
create policy "leagues_update_commissioner" on public.leagues for update using (commissioner_id = auth.uid());

-- LEAGUE MEMBERS: readable by members of same league
create policy "members_read_same_league" on public.league_members for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.league_members lm2 where lm2.league_id = league_id and lm2.user_id = auth.uid())
  );
create policy "members_insert_self" on public.league_members for insert with check (user_id = auth.uid());
create policy "members_update_self" on public.league_members for update using (user_id = auth.uid());

-- DRAFT PICKS: visible to all league members
create policy "picks_read_members" on public.draft_picks for select
  using (exists (select 1 from public.league_members where league_id = draft_picks.league_id and user_id = auth.uid()));
create policy "picks_insert_self" on public.draft_picks for insert with check (user_id = auth.uid());

-- WEEKLY SCORES: visible to all league members
create policy "scores_read_members" on public.weekly_scores for select
  using (exists (select 1 from public.league_members where league_id = weekly_scores.league_id and user_id = auth.uid()));

-- MATCHUPS: visible to all league members
create policy "matchups_read_members" on public.matchups for select
  using (exists (select 1 from public.league_members where league_id = matchups.league_id and user_id = auth.uid()));

-- PLAYOFF GAMES: visible to all league members
create policy "playoff_read_members" on public.playoff_games for select
  using (exists (select 1 from public.league_members where league_id = playoff_games.league_id and user_id = auth.uid()));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Generate unique invite code (6 chars alphanumeric)
create or replace function public.generate_invite_code()
returns text as $$
declare
  code text;
  exists boolean;
begin
  loop
    -- Generate random 6-char code: letters + numbers
    code := upper(substring(md5(random()::text) from 1 for 6));
    select exists(select 1 from public.leagues where invite_code = code) into exists;
    exit when not exists;
  end loop;
  return code;
end;
$$ language plpgsql;

-- Auto-generate invite code on league insert if not provided
create or replace function public.set_invite_code()
returns trigger as $$
begin
  if new.invite_code is null or new.invite_code = '' then
    new.invite_code := public.generate_invite_code();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger leagues_set_invite_code
  before insert on public.leagues
  for each row execute procedure public.set_invite_code();

-- ============================================================
-- INDEXES (performance)
-- ============================================================
create index leagues_invite_code_idx    on public.leagues(invite_code);
create index leagues_status_idx         on public.leagues(status);
create index members_league_id_idx      on public.league_members(league_id);
create index members_user_id_idx        on public.league_members(user_id);
create index picks_league_id_idx        on public.draft_picks(league_id);
create index picks_pick_number_idx      on public.draft_picks(league_id, pick_number);
create index scores_league_week_idx     on public.weekly_scores(league_id, week);
create index matchups_league_week_idx   on public.matchups(league_id, week);
