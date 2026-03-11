-- ============================================================
-- Migration 6: Auth Sync & Setup Functions
-- Consolidated from: sync_auth_users_to_profiles,
--   add_is_setup_complete_fn
-- ============================================================

-- ============================================================
-- AUTH USER SYNC TRIGGER
-- Propagates auth.users changes to public.profiles
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_auth_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET
    email      = NEW.email,
    full_name  = COALESCE(
      NULLIF(TRIM(
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
      ), ''),
      full_name
    ),
    first_name = COALESCE(
      NULLIF(TRIM(
        COALESCE(NEW.raw_user_meta_data->>'first_name', '')
      ), ''),
      first_name
    ),
    last_name  = COALESCE(
      NULLIF(TRIM(
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
      ), ''),
      last_name
    ),
    avatar_url = CASE
      WHEN NEW.raw_user_meta_data ? 'avatar_url'
        THEN NEW.raw_user_meta_data->>'avatar_url'
      ELSE avatar_url
    END
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_update();

-- ============================================================
-- SETUP COMPLETE CHECK
-- SECURITY DEFINER so anonymous callers can check without RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_setup_complete()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE role = 'root_admin');
$$;

GRANT EXECUTE ON FUNCTION public.is_setup_complete() TO anon, authenticated;
