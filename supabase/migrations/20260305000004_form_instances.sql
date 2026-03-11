-- ============================================================
-- Migration 4: Form Instances
-- Consolidated from: create_form_instances_table, field_values,
--   instance_schedules, schedule_group_targets, triggers, indexes,
--   performance fixes, cron job, templates_with_stats view,
--   rename_draft_to_pending, upsert_field_value_fn,
--   enable_realtime, form_uploads_storage
-- ============================================================

-- ============================================================
-- FORM INSTANCES
-- ============================================================

CREATE TABLE public.form_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  readable_id TEXT NOT NULL UNIQUE,
  template_version_id UUID NOT NULL REFERENCES public.template_versions(id),
  group_id UUID NOT NULL REFERENCES public.groups(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted')),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  short_url_view TEXT,
  short_url_edit TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  submitted_by UUID REFERENCES public.profiles(id),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_instances ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FIELD VALUES
-- ============================================================

CREATE TABLE public.field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_instance_id UUID NOT NULL REFERENCES public.form_instances(id),
  template_field_id UUID NOT NULL REFERENCES public.template_fields(id),
  value TEXT,
  updated_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  assigned_by UUID REFERENCES public.profiles(id),
  change_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_instance_id, template_field_id)
);

ALTER TABLE public.field_values ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- INSTANCE SCHEDULES
-- ============================================================

CREATE TABLE public.instance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL UNIQUE REFERENCES public.form_templates(id),
  start_date DATE NOT NULL,
  repeat_interval TEXT NOT NULL CHECK (repeat_interval IN ('daily', 'weekly', 'bi_weekly', 'monthly')),
  repeat_every INTEGER NOT NULL DEFAULT 1,
  days_of_week JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instance_schedules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SCHEDULE GROUP TARGETS
-- ============================================================

CREATE TABLE public.schedule_group_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.instance_schedules(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, group_id)
);

ALTER TABLE public.schedule_group_targets ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.form_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.instance_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- FK INDEXES
-- ============================================================

CREATE INDEX idx_form_instances_template_version_id ON public.form_instances(template_version_id);
CREATE INDEX idx_form_instances_group_id ON public.form_instances(group_id);
CREATE INDEX idx_form_instances_created_by ON public.form_instances(created_by);
CREATE INDEX idx_form_instances_submitted_by ON public.form_instances(submitted_by);
CREATE INDEX idx_form_instances_status ON public.form_instances(status);
CREATE INDEX idx_field_values_updated_by ON public.field_values(updated_by);
CREATE INDEX idx_field_values_assigned_to ON public.field_values(assigned_to);
CREATE INDEX idx_field_values_assigned_by ON public.field_values(assigned_by);
CREATE INDEX idx_instance_schedules_created_by ON public.instance_schedules(created_by);
CREATE INDEX idx_schedule_group_targets_group_id ON public.schedule_group_targets(group_id);

-- ============================================================
-- RLS POLICIES — form_instances
-- ============================================================

CREATE POLICY form_instances_select ON public.form_instances
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

CREATE POLICY form_instances_insert ON public.form_instances
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY form_instances_update_submit ON public.form_instances
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND group_id = get_current_user_group_id()
  AND status = 'pending'
);

CREATE POLICY form_instances_update_root_admin ON public.form_instances
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- ============================================================
-- RLS POLICIES — field_values
-- ============================================================

CREATE POLICY field_values_select ON public.field_values
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_instances fi
      WHERE fi.id = field_values.form_instance_id
      AND fi.group_id = get_current_user_group_id()
    )
  )
);

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

-- ============================================================
-- RLS POLICIES — instance_schedules
-- ============================================================

CREATE POLICY instance_schedules_select ON public.instance_schedules
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_templates ft
      WHERE ft.id = instance_schedules.template_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tta
          WHERE tta.template_id = ft.id
          AND tta.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

CREATE POLICY instance_schedules_insert ON public.instance_schedules
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY instance_schedules_update ON public.instance_schedules
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY instance_schedules_delete ON public.instance_schedules
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- ============================================================
-- RLS POLICIES — schedule_group_targets
-- ============================================================

CREATE POLICY schedule_group_targets_select ON public.schedule_group_targets
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

CREATE POLICY schedule_group_targets_insert ON public.schedule_group_targets
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY schedule_group_targets_delete ON public.schedule_group_targets
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- ============================================================
-- FORM INSTANCE CREATED TRIGGER (pg_net -> Edge Function)
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_form_instance_created()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload jsonb;
BEGIN
  _payload := jsonb_build_object(
    'id', NEW.id,
    'readable_id', NEW.readable_id
  );

  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/on-instance-created',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_form_instance_created
  AFTER INSERT ON public.form_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_form_instance_created();

-- ============================================================
-- UPSERT FIELD VALUE FUNCTION (atomic upsert with change_log)
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_field_value(
  p_instance_id UUID,
  p_field_id UUID,
  p_value TEXT,
  p_old_value TEXT,
  p_user_id UUID
) RETURNS SETOF public.field_values
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_entry JSONB;
BEGIN
  v_log_entry := jsonb_build_object(
    'old_value', p_old_value,
    'new_value', p_value,
    'changed_by', p_user_id::text,
    'changed_at', now()::text
  );

  RETURN QUERY
  INSERT INTO public.field_values (form_instance_id, template_field_id, value, updated_by, change_log)
  VALUES (p_instance_id, p_field_id, p_value, p_user_id, jsonb_build_array(v_log_entry))
  ON CONFLICT (form_instance_id, template_field_id) DO UPDATE SET
    value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    change_log = field_values.change_log || jsonb_build_array(v_log_entry)
  RETURNING *;
END;
$$;

-- ============================================================
-- ENABLE REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.field_values;
ALTER PUBLICATION supabase_realtime ADD TABLE public.form_instances;

-- ============================================================
-- SCHEDULED INSTANCES CRON FUNCTION
-- ============================================================

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

-- Schedule the function to run every 5 minutes via pg_cron
SELECT cron.schedule(
  'create_scheduled_instances',
  '*/5 * * * *',
  $$SELECT public.create_scheduled_instances()$$
);

-- ============================================================
-- TEMPLATES WITH STATS VIEW
-- ============================================================

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

-- ============================================================
-- FORM-UPLOADS STORAGE BUCKET AND POLICIES
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('form-uploads', 'form-uploads', false, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload form files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'form-uploads');

CREATE POLICY "Authenticated users can read form files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'form-uploads');

CREATE POLICY "Authenticated users can delete form files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'form-uploads');

CREATE POLICY "Authenticated users can update form files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'form-uploads')
  WITH CHECK (bucket_id = 'form-uploads');

-- ============================================================
-- HARD DELETE TEMPLATE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION hard_delete_template(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM field_values
  WHERE form_instance_id IN (
    SELECT fi.id
    FROM form_instances fi
    JOIN template_versions tv ON fi.template_version_id = tv.id
    WHERE tv.template_id = p_template_id
  );

  DELETE FROM form_instances
  WHERE template_version_id IN (
    SELECT id FROM template_versions WHERE template_id = p_template_id
  );

  DELETE FROM schedule_group_targets
  WHERE schedule_id IN (
    SELECT id FROM instance_schedules WHERE template_id = p_template_id
  );

  DELETE FROM instance_schedules
  WHERE template_id = p_template_id;

  DELETE FROM template_group_access
  WHERE template_id = p_template_id;

  DELETE FROM form_templates
  WHERE id = p_template_id;
END;
$$;
