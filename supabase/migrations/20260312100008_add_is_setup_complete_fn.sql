-- Check whether the initial setup has been completed (root admin exists).
-- SECURITY DEFINER so anonymous callers can read this without RLS.
CREATE OR REPLACE FUNCTION public.is_setup_complete()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE role = 'root_admin');
$$;

-- Allow both anonymous and authenticated callers
GRANT EXECUTE ON FUNCTION public.is_setup_complete() TO anon, authenticated;
