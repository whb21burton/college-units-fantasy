-- Trades table
create table if not exists public.trades (
  id              uuid default uuid_generate_v4() primary key,
  league_id       uuid not null references public.leagues(id) on delete cascade,
  proposer_id     uuid not null,
  receiver_id     uuid not null,
  offer_pick_ids  text[] not null default '{}',
  request_pick_ids text[] not null default '{}',
  status          text not null default 'pending',  -- pending | accepted | declined | cancelled
  created_at      timestamptz default now()
);

alter table public.trades enable row level security;

create policy "trades_select" on public.trades for select
  using (proposer_id = auth.uid() or receiver_id = auth.uid());

create policy "trades_insert" on public.trades for insert
  with check (proposer_id = auth.uid());

create policy "trades_update" on public.trades for update
  using (proposer_id = auth.uid() or receiver_id = auth.uid());

-- Allow league members to update pick user_id (for trade execution)
create policy "picks_update_trade" on public.draft_picks for update
  using (
    exists (
      select 1 from public.league_members
      where league_id = draft_picks.league_id
      and user_id = auth.uid()
    )
  );
