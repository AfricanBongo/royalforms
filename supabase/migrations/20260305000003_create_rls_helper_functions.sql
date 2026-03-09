-- RLS helper functions that read from JWT claims (in-memory, no DB queries).
-- All are STABLE (no side effects) and SECURITY DEFINER (execute with creator's privileges).
-- Every RLS policy uses (select is_active_user()) as a base condition.
-- search_path set to '' to prevent search_path injection.

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (auth.jwt()->'user_metadata'->>'role')::text;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_group_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (auth.jwt()->'user_metadata'->>'group_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((auth.jwt()->'user_metadata'->>'is_active')::boolean, false);
$$;
