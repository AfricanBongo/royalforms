-- Add avatar_url, first_name, last_name to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill first_name/last_name from full_name for existing rows
-- Split on first space: everything before = first_name, everything after = last_name
UPDATE public.profiles
SET
  first_name = CASE
    WHEN full_name LIKE '% %' THEN split_part(full_name, ' ', 1)
    ELSE full_name
  END,
  last_name = CASE
    WHEN full_name LIKE '% %' THEN substring(full_name FROM position(' ' IN full_name) + 1)
    ELSE ''
  END
WHERE first_name IS NULL;
