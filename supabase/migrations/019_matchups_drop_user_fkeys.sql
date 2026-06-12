-- Drop auth.users FK constraints from matchups so CPU bots (null user_id) can
-- be referenced via league_members.id instead of auth.users.id.
ALTER TABLE public.matchups DROP CONSTRAINT IF EXISTS matchups_team1_id_fkey;
ALTER TABLE public.matchups DROP CONSTRAINT IF EXISTS matchups_team2_id_fkey;
ALTER TABLE public.matchups DROP CONSTRAINT IF EXISTS matchups_winner_id_fkey;
