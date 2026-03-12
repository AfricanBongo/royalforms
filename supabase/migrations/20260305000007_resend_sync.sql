-- ============================================================
-- Migration 7: Resend Contact/Segment Sync
-- Consolidated from: add_resend_sync_schema, create_resend_sync_triggers
-- ============================================================

-- ============================================================
-- RESEND SYNC QUEUE TABLE
-- ============================================================

CREATE TABLE public.resend_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN (
    'create_segment',
    'create_contact',
    'delete_contact',
    'move_contact',
    'deactivate_contact',
    'reactivate_contact'
  )),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.resend_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY resend_sync_queue_select ON public.resend_sync_queue
FOR SELECT USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

CREATE POLICY resend_sync_queue_update ON public.resend_sync_queue
FOR UPDATE USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

CREATE POLICY resend_sync_queue_insert ON public.resend_sync_queue
FOR INSERT WITH CHECK (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

CREATE POLICY resend_sync_queue_delete ON public.resend_sync_queue
FOR DELETE USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

CREATE INDEX idx_resend_sync_queue_pending
  ON public.resend_sync_queue(status)
  WHERE status != 'completed';

CREATE TRIGGER set_resend_sync_queue_updated_at
  BEFORE UPDATE ON public.resend_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- TRIGGER 1: Create Resend segment when a group is created
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_group_created_sync_resend()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload jsonb;
BEGIN
  _payload := jsonb_build_object(
    'action', 'create_segment',
    'group_id', NEW.id,
    'group_name', NEW.name
  );

  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_group_created_sync_resend
  AFTER INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_group_created_sync_resend();

-- ============================================================
-- TRIGGER 2: Sync Resend contact on profile changes
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_profile_updated_sync_resend()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload jsonb;
BEGIN
  -- Case 1: User completed onboarding
  IF OLD.invite_status = 'invite_sent'
    AND NEW.invite_status = 'completed'
    AND NEW.is_active = true
  THEN
    _payload := jsonb_build_object(
      'action', 'create_contact',
      'email', NEW.email,
      'first_name', COALESCE(NEW.first_name, ''),
      'last_name', COALESCE(NEW.last_name, ''),
      'group_id', NEW.group_id
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );

    RETURN NEW;
  END IF;

  -- Case 2: User deactivated
  IF OLD.is_active = true
    AND NEW.is_active = false
    AND NEW.invite_status = 'completed'
  THEN
    _payload := jsonb_build_object(
      'action', 'deactivate_contact',
      'email', NEW.email,
      'group_id', NEW.group_id
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );

    RETURN NEW;
  END IF;

  -- Case 3: User reactivated
  IF OLD.is_active = false
    AND NEW.is_active = true
    AND NEW.invite_status = 'completed'
  THEN
    _payload := jsonb_build_object(
      'action', 'reactivate_contact',
      'email', NEW.email,
      'first_name', COALESCE(NEW.first_name, ''),
      'last_name', COALESCE(NEW.last_name, ''),
      'group_id', NEW.group_id
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );

    RETURN NEW;
  END IF;

  -- Case 4: User moved to different group
  IF OLD.group_id IS DISTINCT FROM NEW.group_id
    AND NEW.is_active = true
    AND NEW.invite_status = 'completed'
  THEN
    _payload := jsonb_build_object(
      'action', 'move_contact',
      'email', NEW.email,
      'old_group_id', OLD.group_id,
      'new_group_id', NEW.group_id
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_updated_sync_resend
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_profile_updated_sync_resend();

-- ============================================================
-- TRIGGER 3: Remove Resend contact when profile deleted
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_profile_deleted_sync_resend()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload jsonb;
BEGIN
  IF OLD.invite_status != 'completed' THEN
    RETURN OLD;
  END IF;

  _payload := jsonb_build_object(
    'action', 'delete_contact',
    'email', OLD.email
  );

  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN OLD;
END;
$$;

CREATE TRIGGER on_profile_deleted_sync_resend
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_profile_deleted_sync_resend();
