-- Increase readable_id length from 8 to 10 characters for lower collision probability.
-- Updates the create_scheduled_instances cron function to generate 10-char IDs.
-- Client-side generation (form-templates.ts) is updated separately in application code.

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
