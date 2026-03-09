-- Function: create_scheduled_instances
-- Runs via pg_cron every 5 minutes.
-- Finds active schedules that are due, creates form instances for each target group,
-- then advances the schedule's next_run_at.

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
  v_abbreviation TEXT;
  v_new_counter INTEGER;
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

    -- Get the template abbreviation
    SELECT ft.abbreviation INTO v_abbreviation
    FROM form_templates ft
    WHERE ft.id = rec.template_id;

    -- For each target group in this schedule, create an instance
    FOR target IN
      SELECT sgt.group_id
      FROM schedule_group_targets sgt
      WHERE sgt.schedule_id = rec.schedule_id
    LOOP
      -- Atomically increment the instance_counter and get the new value
      UPDATE form_templates
      SET instance_counter = instance_counter + 1,
          updated_at = now()
      WHERE id = rec.template_id
      RETURNING instance_counter INTO v_new_counter;

      -- Generate the readable_id: abbreviation-zero_padded_counter
      v_readable_id := v_abbreviation || '-' || lpad(v_new_counter::text, 3, '0');

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

-- Schedule the function to run every 5 minutes via pg_cron
SELECT cron.schedule(
  'create_scheduled_instances',
  '*/5 * * * *',
  $$SELECT public.create_scheduled_instances()$$
);
