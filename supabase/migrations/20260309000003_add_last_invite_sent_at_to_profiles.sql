-- Add last_invite_sent_at column to profiles for invite resend rate limiting.
-- NULL means no invite has been sent (e.g. root admin or pre-existing users).
ALTER TABLE public.profiles
  ADD COLUMN last_invite_sent_at TIMESTAMPTZ;
