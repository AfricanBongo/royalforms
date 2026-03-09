-- Member requests: Admins request new members for their group.
-- Root Admin approves or rejects.

CREATE TABLE public.member_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id),
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  proposed_role TEXT NOT NULL CHECK (proposed_role IN ('admin', 'editor', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  decided_by UUID REFERENCES public.profiles(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.member_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Admin sees requests for their own group.
CREATE POLICY member_requests_select ON public.member_requests
FOR SELECT USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR (
      (select get_current_user_role()) = 'admin'
      AND group_id = (select get_current_user_group_id())
    )
  )
);

-- INSERT: Admin only, for their own group. Cannot propose root_admin role.
CREATE POLICY member_requests_insert ON public.member_requests
FOR INSERT WITH CHECK (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'admin'
  AND group_id = (select get_current_user_group_id())
  AND proposed_role IN ('admin', 'editor', 'viewer')
);

-- UPDATE: Root Admin only (for approving/rejecting).
CREATE POLICY member_requests_update ON public.member_requests
FOR UPDATE USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);
