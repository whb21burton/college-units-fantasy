-- Add per-account entry limit to leagues table
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS max_entries_per_user integer DEFAULT NULL;
