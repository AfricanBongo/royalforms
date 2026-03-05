-- Profiles table. One row per auth.users entry.
-- Created by Edge Functions using service role key (no INSERT RLS policy needed).

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('root_admin', 'admin', 'editor', 'viewer')),
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see own row + same group members.
CREATE POLICY profiles_select ON public.profiles
FOR SELECT USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR id = (select auth.uid())
    OR group_id = (select get_current_user_group_id())
  )
);

-- UPDATE: User can update own row OR root admin can update any row.
-- Merged into single policy to avoid multiple permissive policies per action.
CREATE POLICY profiles_update ON public.profiles
FOR UPDATE USING (
  (select is_active_user()) = true
  AND (
    id = (select auth.uid())
    OR (select get_current_user_role()) = 'root_admin'
  )
);
