-- 012_lineup_entries.sql
-- Adds week + entry_type columns to draft_picks for DFS/weekly lineup support

ALTER TABLE draft_picks
  ADD COLUMN IF NOT EXISTS week       integer,
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'draft';

-- Index for fast leaderboard queries by league + week + entry_type
CREATE INDEX IF NOT EXISTS draft_picks_lineup_idx
  ON draft_picks (league_id, week, entry_type);
