-- Add status column to template_versions (draft/published per version).
-- Add ON DELETE CASCADE to simplify draft cleanup.
-- Add DELETE RLS policies for draft templates and draft versions.
-- Recreate templates_with_stats view with version status.
-- Update create_scheduled_instances to skip draft versions.

-- -----------------------------------------------------------------------
-- 1. Add status column
-- -----------------------------------------------------------------------

ALTER TABLE public.template_versions
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';

-- Backfill: all existing versions are published
UPDATE public.template_versions SET status = 'published';

-- -----------------------------------------------------------------------
-- 2. Add ON DELETE CASCADE for clean draft deletion
-- -----------------------------------------------------------------------

-- template_sections → template_versions
ALTER TABLE public.template_sections
  DROP CONSTRAINT template_sections_template_version_id_fkey,
  ADD CONSTRAINT template_sections_template_version_id_fkey
    FOREIGN KEY (template_version_id)
    REFERENCES public.template_versions(id)
    ON DELETE CASCADE;

-- template_versions → form_templates
ALTER TABLE public.template_versions
  DROP CONSTRAINT template_versions_template_id_fkey,
  ADD CONSTRAINT template_versions_template_id_fkey
    FOREIGN KEY (template_id)
    REFERENCES public.form_templates(id)
    ON DELETE CASCADE;

-- -----------------------------------------------------------------------
-- 3. DELETE RLS policies
-- -----------------------------------------------------------------------

-- Draft templates can be deleted by root_admin
CREATE POLICY form_templates_delete ON public.form_templates
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND status = 'draft'
);

-- Draft versions can be deleted by root_admin
CREATE POLICY template_versions_delete ON public.template_versions
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND status = 'draft'
);

-- -----------------------------------------------------------------------
-- 4. Recreate templates_with_stats view with version status
-- -----------------------------------------------------------------------

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
    COUNT(*) FILTER (WHERE fi.status = 'draft')     AS pending_count
  FROM public.form_instances fi
  INNER JOIN public.template_versions tv2
    ON tv2.id = fi.template_version_id
  WHERE tv2.template_id = ft.id
    AND fi.is_archived = false
) ic ON true;

COMMENT ON VIEW public.templates_with_stats IS
  'Template list with status, latest version number/status and instance counts.';

-- -----------------------------------------------------------------------
-- 5. Update create_scheduled_instances to skip draft versions
-- -----------------------------------------------------------------------

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
        v_readable_id := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
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
        'draft',
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
