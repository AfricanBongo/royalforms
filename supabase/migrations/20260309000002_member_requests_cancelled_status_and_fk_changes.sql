-- 1. Add 'cancelled' to the status check constraint
ALTER TABLE public.member_requests
  DROP CONSTRAINT member_requests_status_check;
ALTER TABLE public.member_requests
  ADD CONSTRAINT member_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- 2. Make requested_by nullable (currently NOT NULL)
ALTER TABLE public.member_requests
  ALTER COLUMN requested_by DROP NOT NULL;

-- 3. Change requested_by FK to ON DELETE SET NULL
ALTER TABLE public.member_requests
  DROP CONSTRAINT member_requests_requested_by_fkey;
ALTER TABLE public.member_requests
  ADD CONSTRAINT member_requests_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. Change decided_by FK to ON DELETE SET NULL
ALTER TABLE public.member_requests
  DROP CONSTRAINT member_requests_decided_by_fkey;
ALTER TABLE public.member_requests
  ADD CONSTRAINT member_requests_decided_by_fkey
    FOREIGN KEY (decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
