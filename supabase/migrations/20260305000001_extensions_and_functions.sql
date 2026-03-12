-- ============================================================
-- Migration 1: Extensions & Shared Functions
-- Consolidated from: enable_extensions, create_update_updated_at_function,
--                    create_rls_helper_functions
-- ============================================================

-- Enable pg_net extension (HTTP requests from Postgres triggers)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable pg_cron extension (scheduled jobs)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ============================================================
-- Reusable trigger function to auto-set updated_at on row updates
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- RLS helper functions that read from JWT claims (in-memory, no DB queries).
-- All are STABLE (no side effects) and SECURITY DEFINER.
-- search_path set to '' to prevent search_path injection.
-- ============================================================

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
