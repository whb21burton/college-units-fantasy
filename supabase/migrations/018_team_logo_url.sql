-- Add team_logo_url column to league_members for custom team logos
alter table public.league_members add column if not exists team_logo_url text;
