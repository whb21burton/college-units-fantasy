-- ── LEAGUE MESSAGES (chat) ───────────────────────────────────────────────────
-- Creates the table if it doesn't exist yet (it may have been created manually
-- in the Supabase dashboard), adds display_name column if missing, enables RLS,
-- and sets up INSERT/SELECT policies so authenticated users can send and receive
-- messages in leagues they belong to.

create table if not exists public.league_messages (
  id           uuid default gen_random_uuid() primary key,
  league_id    uuid references public.leagues(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete set null,
  display_name text,
  team_name    text,          -- kept for backward compat with old rows
  message      text not null,
  created_at   timestamptz default now()
);

-- Add display_name column to existing tables that only have team_name
alter table public.league_messages add column if not exists display_name text;
alter table public.league_messages add column if not exists team_name    text;

-- Index for fast per-league queries
create index if not exists league_messages_league_id_idx
  on public.league_messages(league_id, created_at);

-- Enable RLS
alter table public.league_messages enable row level security;

-- SELECT: any authenticated user who is a member of the league can read messages
create policy if not exists "messages_select_member" on public.league_messages
  for select using (
    auth.uid() is not null
    and (
      -- commissioner always has access
      exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = auth.uid())
      or
      -- members of the league
      exists (select 1 from public.league_members m where m.league_id = league_messages.league_id and m.user_id = auth.uid())
    )
  );

-- INSERT: authenticated users can insert their own messages
create policy if not exists "messages_insert_auth" on public.league_messages
  for insert with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );
