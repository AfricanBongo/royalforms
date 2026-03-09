-- Add email_change_count to profiles for tracking how many times
-- the root admin has changed an invitee's email address.
-- Max 3 changes allowed. Defaults to 0 for all existing rows.
ALTER TABLE public.profiles
  ADD COLUMN email_change_count INTEGER NOT NULL DEFAULT 0;
