-- Add logo and abbreviation columns to cached_teams for team-logos caching
ALTER TABLE public.cached_teams ADD COLUMN IF NOT EXISTS logo text;
ALTER TABLE public.cached_teams ADD COLUMN IF NOT EXISTS abbreviation text;
