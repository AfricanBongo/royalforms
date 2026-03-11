-- Add is_bootstrap flag to groups table and protect bootstrap groups
-- Bootstrap groups cannot be deleted or deactivated.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS is_bootstrap BOOLEAN NOT NULL DEFAULT false;

-- Trigger function: prevent DELETE or deactivation of bootstrap groups
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

DROP TRIGGER IF EXISTS protect_bootstrap_group_trigger ON public.groups;

CREATE TRIGGER protect_bootstrap_group_trigger
  BEFORE UPDATE OR DELETE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_bootstrap_group();
