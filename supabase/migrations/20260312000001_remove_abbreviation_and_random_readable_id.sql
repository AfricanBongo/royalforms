-- Remove the abbreviation column from form_templates.
-- Replace abbreviation-based readable_id generation with random 8-char strings.

-- -----------------------------------------------------------------------
-- 1. Drop the view that depends on abbreviation, then drop the column
-- -----------------------------------------------------------------------

DROP VIEW IF EXISTS public.templates_with_stats;

ALTER TABLE public.form_templates DROP COLUMN IF EXISTS abbreviation;

-- Also drop the instance_counter column (no longer needed for readable_id)
ALTER TABLE public.form_templates DROP COLUMN IF EXISTS instance_counter;

-- -----------------------------------------------------------------------
-- 2. Recreate the templates_with_stats view WITHOUT abbreviation
-- -----------------------------------------------------------------------

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
  COALESCE(lv.version_number, 0)  AS latest_version,
  COALESCE(ic.submitted_count, 0) AS submitted_count,
  COALESCE(ic.pending_count, 0)   AS pending_count
FROM public.form_templates ft
LEFT JOIN LATERAL (
  SELECT tv.version_number
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
  'Template list with status, latest version number and instance counts.';

-- -----------------------------------------------------------------------
-- 3. Replace the cron function to use random 8-char readable_id
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
  -- Find all active schedules that are due
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
  LOOP
    -- Get the latest template version
    SELECT tv.id INTO v_latest_version_id
    FROM template_versions tv
    WHERE tv.template_id = rec.template_id
      AND tv.is_latest = true
    LIMIT 1;

    -- Skip if no latest version exists
    IF v_latest_version_id IS NULL THEN
      RAISE WARNING 'create_scheduled_instances: No latest version for template %, skipping schedule %',
        rec.template_id, rec.schedule_id;
      CONTINUE;
    END IF;

    -- For each target group in this schedule, create an instance
    FOR target IN
      SELECT sgt.group_id
      FROM schedule_group_targets sgt
      WHERE sgt.schedule_id = rec.schedule_id
    LOOP
      -- Generate a random 8-character alphanumeric readable_id
      -- Uses a loop to guarantee uniqueness against existing readable_ids
      LOOP
        v_readable_id := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM form_instances WHERE readable_id = v_readable_id
        );
      END LOOP;

      -- Insert the form instance
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

    -- Compute the next run time based on the interval
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

    -- Update the schedule: mark last run and advance next run
    UPDATE instance_schedules
    SET last_run_at = now(),
        next_run_at = v_new_next_run,
        updated_at = now()
    WHERE id = rec.schedule_id;

  END LOOP;
END;
$$;
