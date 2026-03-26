-- 011_league_conference.sql
-- Adds conference_filter to leagues and salary_cost to draft_picks.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS conference_filter text NOT NULL DEFAULT 'ALL';

-- draft_picks: store the salary cap cost paid for each pick (null = snake draft)
ALTER TABLE public.draft_picks
  ADD COLUMN IF NOT EXISTS salary_cost integer;
