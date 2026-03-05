-- Groups table. created_by FK to profiles added in a later migration
-- to resolve the circular dependency (profiles.group_id -> groups.id,
-- groups.created_by -> profiles.id).

CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL, -- FK added after profiles table exists
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all groups. Others see only their own active group.
-- All auth calls wrapped in (select ...) for initplan optimization.
CREATE POLICY groups_select ON public.groups
FOR SELECT USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR (id = (select get_current_user_group_id()) AND is_active = true)
  )
);

-- INSERT: Root Admin only.
CREATE POLICY groups_insert ON public.groups
FOR INSERT WITH CHECK (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

-- UPDATE: Root Admin only.
CREATE POLICY groups_update ON public.groups
FOR UPDATE USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);
