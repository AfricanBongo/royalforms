-- Trigger: sync auth.users changes to public.profiles
-- When a user updates their email (via confirmation), or when user_metadata
-- changes (name, avatar), propagate those changes to the profiles table.

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
      -- Only update avatar_url if the key exists in metadata
      WHEN NEW.raw_user_meta_data ? 'avatar_url'
        THEN NEW.raw_user_meta_data->>'avatar_url'
      ELSE avatar_url
    END
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_update();
