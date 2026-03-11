-- ============================================================
-- Migration 2: Foundation Tables
-- Consolidated from: create_groups_table, create_profiles_table,
--   add_groups_created_by_fk, create_member_requests_table,
--   apply_updated_at_triggers_foundation, add_foreign_key_indexes,
--   create_avatars_bucket_policies, create_groups_with_member_count_view,
--   allow_root_admin_member_request_insert/delete,
--   add_invite_status, cancelled_status, last_invite_sent_at,
--   email_change_count, avatar_firstname_lastname,
--   add_avatars_select_policy, bootstrap_group_protection
-- ============================================================

-- ============================================================
-- GROUPS
-- ============================================================

CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL, -- FK added after profiles table exists
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_bootstrap BOOLEAN NOT NULL DEFAULT false,
  resend_segment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- ============================================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('root_admin', 'admin', 'editor', 'viewer')),
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  invite_status TEXT NOT NULL DEFAULT 'completed'
    CONSTRAINT profiles_invite_status_check CHECK (invite_status IN ('invite_sent', 'completed')),
  last_invite_sent_at TIMESTAMPTZ,
  email_change_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Resolve circular dependency: add groups.created_by FK to profiles
-- ============================================================

ALTER TABLE public.groups
  ADD CONSTRAINT groups_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- ============================================================
-- MEMBER REQUESTS
-- ============================================================

CREATE TABLE public.member_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id),
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  proposed_role TEXT NOT NULL CHECK (proposed_role IN ('admin', 'editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT member_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.member_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_member_requests_updated_at
  BEFORE UPDATE ON public.member_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- FK INDEXES
-- ============================================================

CREATE INDEX idx_profiles_group_id ON public.profiles (group_id);
CREATE INDEX idx_groups_created_by ON public.groups (created_by);
CREATE INDEX idx_member_requests_group_id ON public.member_requests (group_id);
CREATE INDEX idx_member_requests_requested_by ON public.member_requests (requested_by);
CREATE INDEX idx_member_requests_decided_by ON public.member_requests (decided_by);

-- ============================================================
-- RLS POLICIES — profiles
-- ============================================================

CREATE POLICY profiles_select ON public.profiles
FOR SELECT
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR id = (select auth.uid())
    OR group_id = (select get_current_user_group_id())
  )
);

CREATE POLICY profiles_update ON public.profiles
FOR UPDATE
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (
    id = (select auth.uid())
    OR (select get_current_user_role()) = 'root_admin'
  )
);

-- ============================================================
-- RLS POLICIES — groups
-- ============================================================

CREATE POLICY groups_select ON public.groups
FOR SELECT
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR (id = (select get_current_user_group_id()) AND is_active = true)
  )
);

CREATE POLICY groups_insert ON public.groups
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

CREATE POLICY groups_update ON public.groups
FOR UPDATE
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

-- ============================================================
-- RLS POLICIES — member_requests
-- ============================================================

CREATE POLICY member_requests_select ON public.member_requests
FOR SELECT
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR (
      (select get_current_user_role()) = 'admin'
      AND group_id = (select get_current_user_group_id())
    )
  )
);

CREATE POLICY member_requests_insert ON public.member_requests
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND (
    (get_current_user_role() = 'root_admin' AND proposed_role IN ('admin', 'editor', 'viewer'))
    OR
    (get_current_user_role() = 'admin' AND group_id = get_current_user_group_id() AND proposed_role IN ('admin', 'editor', 'viewer'))
  )
);

CREATE POLICY member_requests_update ON public.member_requests
FOR UPDATE
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

CREATE POLICY member_requests_delete ON public.member_requests
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- ============================================================
-- AVATARS STORAGE POLICIES
-- Bucket created via config.toml (public = true).
-- ============================================================

CREATE POLICY "Users can upload own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own avatar"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- GROUPS WITH MEMBER COUNT VIEW
-- ============================================================

CREATE OR REPLACE VIEW public.groups_with_member_count AS
SELECT
  g.id,
  g.name,
  g.is_active,
  g.created_at,
  g.created_by,
  COALESCE(pc.member_count, 0)::int AS member_count
FROM public.groups g
LEFT JOIN (
  SELECT group_id, COUNT(*)::int AS member_count
  FROM public.profiles
  WHERE is_active = true
  GROUP BY group_id
) pc ON pc.group_id = g.id;

GRANT SELECT ON public.groups_with_member_count TO anon, authenticated;
ALTER VIEW public.groups_with_member_count SET (security_invoker = on);

-- ============================================================
-- BOOTSTRAP GROUP PROTECTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_bootstrap_group()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_bootstrap THEN
      RAISE EXCEPTION 'Cannot delete a bootstrap group';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_bootstrap AND NEW.is_active = false THEN
      RAISE EXCEPTION 'Cannot deactivate a bootstrap group';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_bootstrap_group_trigger
  BEFORE UPDATE OR DELETE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_bootstrap_group();
