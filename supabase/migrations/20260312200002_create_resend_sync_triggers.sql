-- ============================================================
-- Resend contact/segment sync triggers
--
-- 3 triggers that call the sync-resend-contacts Edge Function
-- via pg_net.http_post() to keep Resend audiences in sync
-- with local database state.
--
-- URL: local dev uses Kong gateway (Docker internal).
-- Auth: Edge Function has verify_jwt = false; authenticates
--       itself via its own env vars.
-- ============================================================


-- ============================================================
-- Trigger 1: Create a Resend segment when a group is created
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
-- Trigger 2: Sync Resend contact on profile changes
--
-- Detects 4 cases (checked in order, early return per case):
--   1. User completed onboarding  → create_contact
--   2. User deactivated           → deactivate_contact
--   3. User reactivated           → reactivate_contact
--   4. User moved to new group    → move_contact
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

  -- No matching case -- no sync needed
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_updated_sync_resend
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_profile_updated_sync_resend();


-- ============================================================
-- Trigger 3: Remove Resend contact when a profile is deleted
--
-- Uses BEFORE DELETE so OLD values are still available.
-- Only fires for onboarded users (invite_status = 'completed').
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
  -- Only sync for onboarded users
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
