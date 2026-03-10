-- Rename form_instances status value 'draft' → 'pending'.
-- This does NOT touch template_versions.status which keeps its own 'draft'/'published' values.
--
-- Changes:
--   1. Update existing rows
--   2. Alter CHECK constraint
--   3. Change DEFAULT
--   4. Recreate 5 RLS policies that reference form_instances.status = 'draft'
--   5. Recreate templates_with_stats view
--   6. Recreate create_scheduled_instances cron function

-- ============================================================================
-- 1. Update existing rows
-- ============================================================================

UPDATE public.form_instances SET status = 'pending' WHERE status = 'draft';

-- ============================================================================
-- 2. Alter CHECK constraint on form_instances.status
-- ============================================================================

ALTER TABLE public.form_instances
  DROP CONSTRAINT IF EXISTS form_instances_status_check;

ALTER TABLE public.form_instances
  ADD CONSTRAINT form_instances_status_check
    CHECK (status IN ('pending', 'submitted'));

-- ============================================================================
-- 3. Change DEFAULT
-- ============================================================================

ALTER TABLE public.form_instances
  ALTER COLUMN status SET DEFAULT 'pending';

-- ============================================================================
-- 4. Recreate RLS policies that referenced status = 'draft'
-- ============================================================================

-- 4a. form_instances_update_submit — admin can update pending instances
DROP POLICY IF EXISTS form_instances_update_submit ON public.form_instances;
CREATE POLICY form_instances_update_submit ON public.form_instances
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND group_id = get_current_user_group_id()
  AND status = 'pending'
);

-- 4b. field_values_insert — admin/editor can insert field values on pending instances
DROP POLICY IF EXISTS field_values_insert ON public.field_values;
CREATE POLICY field_values_insert ON public.field_values
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'pending'
  )
);

-- 4c. field_values_update_open — admin/editor can update unassigned field values on pending instances
DROP POLICY IF EXISTS field_values_update_open ON public.field_values;
CREATE POLICY field_values_update_open ON public.field_values
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND assigned_to IS NULL
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'pending'
  )
);

-- 4d. field_values_update_assigned — assigned user can update their field values on pending instances
DROP POLICY IF EXISTS field_values_update_assigned ON public.field_values;
CREATE POLICY field_values_update_assigned ON public.field_values
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND assigned_to IS NOT NULL
  AND assigned_to = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.status = 'pending'
  )
);

-- 4e. field_values_update_admin_assign — admin can update/assign field values on pending instances
DROP POLICY IF EXISTS field_values_update_admin_assign ON public.field_values;
CREATE POLICY field_values_update_admin_assign ON public.field_values
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'pending'
  )
);

-- ============================================================================
-- 5. Recreate templates_with_stats view
-- ============================================================================

DROP VIEW IF EXISTS public.templates_with_stats;

CREATE VIEW public.templates_with_stats AS
SELECT
  ft.id,
  ft.name,
  ft.description,
  ft.sharing_mode,
  ft.status,
  ft.is_active,
  ft.created_at,
  ft.updated_at,
  COALESCE(lv.version_number, 0)          AS latest_version,
  COALESCE(lv.version_status, 'draft')    AS latest_version_status,
  COALESCE(ic.submitted_count, 0)         AS submitted_count,
  COALESCE(ic.pending_count, 0)           AS pending_count
FROM public.form_templates ft
LEFT JOIN LATERAL (
  SELECT tv.version_number, tv.status AS version_status
  FROM public.template_versions tv
  WHERE tv.template_id = ft.id
    AND tv.is_latest = true
  LIMIT 1
) lv ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE fi.status = 'submitted') AS submitted_count,
    COUNT(*) FILTER (WHERE fi.status = 'pending')   AS pending_count
  FROM public.form_instances fi
  INNER JOIN public.template_versions tv2
    ON tv2.id = fi.template_version_id
  WHERE tv2.template_id = ft.id
    AND fi.is_archived = false
) ic ON true;

COMMENT ON VIEW public.templates_with_stats IS
  'Template list with status, latest version number/status and instance counts.';

-- ============================================================================
-- 6. Recreate create_scheduled_instances cron function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_scheduled_instances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  target RECORD;
  v_latest_version_id UUID;
  v_readable_id TEXT;
  v_new_next_run TIMESTAMPTZ;
BEGIN
  FOR rec IN
    SELECT
      s.id AS schedule_id,
      s.template_id,
      s.repeat_interval,
      s.repeat_every,
      s.next_run_at,
      s.created_by
    FROM instance_schedules s
    JOIN form_templates ft ON ft.id = s.template_id
    WHERE s.is_active = true
      AND s.next_run_at <= now()
      AND ft.is_active = true
      AND ft.status = 'published'
  LOOP
    -- Only pick published versions (skip draft edits of published templates)
    SELECT tv.id INTO v_latest_version_id
    FROM template_versions tv
    WHERE tv.template_id = rec.template_id
      AND tv.status = 'published'
    ORDER BY tv.version_number DESC
    LIMIT 1;

    IF v_latest_version_id IS NULL THEN
      RAISE WARNING 'create_scheduled_instances: No published version for template %, skipping schedule %',
        rec.template_id, rec.schedule_id;
      CONTINUE;
    END IF;

    FOR target IN
      SELECT sgt.group_id
      FROM schedule_group_targets sgt
      WHERE sgt.schedule_id = rec.schedule_id
    LOOP
      LOOP
        -- Generate a random 10-character alphanumeric readable_id
        v_readable_id := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM form_instances WHERE readable_id = v_readable_id
        );
      END LOOP;

      INSERT INTO form_instances (
        readable_id,
        template_version_id,
        group_id,
        status,
        created_by
      ) VALUES (
        v_readable_id,
        v_latest_version_id,
        target.group_id,
        'pending',
        rec.created_by
      );
    END LOOP;

    CASE rec.repeat_interval
      WHEN 'daily' THEN
        v_new_next_run := rec.next_run_at + (rec.repeat_every || ' days')::interval;
      WHEN 'weekly' THEN
        v_new_next_run := rec.next_run_at + (rec.repeat_every * 7 || ' days')::interval;
      WHEN 'bi_weekly' THEN
        v_new_next_run := rec.next_run_at + (rec.repeat_every * 14 || ' days')::interval;
      WHEN 'monthly' THEN
        v_new_next_run := rec.next_run_at + (rec.repeat_every || ' months')::interval;
      ELSE
        v_new_next_run := rec.next_run_at + interval '1 day';
    END CASE;

    UPDATE instance_schedules
    SET last_run_at = now(),
        next_run_at = v_new_next_run,
        updated_at = now()
    WHERE id = rec.schedule_id;
  END LOOP;
END;
$$;
