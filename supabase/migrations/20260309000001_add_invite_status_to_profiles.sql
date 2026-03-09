-- Add invite_status column to profiles table.
-- 'invite_sent' = invited but hasn't finished onboarding
-- 'completed'   = fully onboarded (default for existing rows)
ALTER TABLE public.profiles
  ADD COLUMN invite_status TEXT NOT NULL DEFAULT 'completed'
  CONSTRAINT profiles_invite_status_check CHECK (invite_status IN ('invite_sent', 'completed'));
