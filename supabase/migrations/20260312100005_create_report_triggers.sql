-- ============================================================
-- Trigger 1: Auto-generate a report when all sibling form
--            instances in a batch are submitted.
--
-- Fires AFTER UPDATE on form_instances when status changes to 'submitted'.
-- Checks if a report_template with auto_generate = true exists for the
-- form template, then verifies all sibling instances (same group, same
-- form template, same creation date) are submitted before calling the
-- generate-report Edge Function via pg_net.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_form_instance_submitted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _report_template RECORD;
  _all_submitted BOOLEAN;
  _batch_instance_ids UUID[];
  _payload JSONB;
  _template_version_id UUID;
  _form_template_id UUID;
BEGIN
  -- Only fire when status changes to 'submitted'
  IF NEW.status != 'submitted' OR OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;

  -- Find the form_template_id via template_versions
  SELECT tv.template_id INTO _form_template_id
  FROM public.template_versions tv
  WHERE tv.id = NEW.template_version_id;

  IF _form_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if a report template exists with auto_generate = true
  SELECT rt.id, rt.auto_generate INTO _report_template
  FROM public.report_templates rt
  WHERE rt.form_template_id = _form_template_id
    AND rt.is_active = true
    AND rt.auto_generate = true;

  IF _report_template IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if all sibling instances in the same batch are submitted
  -- A "batch" = same group, same form template, same creation date
  SELECT
    bool_and(fi.status = 'submitted'),
    array_agg(fi.id)
  INTO _all_submitted, _batch_instance_ids
  FROM public.form_instances fi
  WHERE fi.group_id = NEW.group_id
    AND fi.template_version_id IN (
      SELECT tv.id FROM public.template_versions tv
      WHERE tv.template_id = _form_template_id
    )
    AND fi.created_at::date = NEW.created_at::date
    AND fi.is_archived = false;

  -- If not all siblings are submitted yet, skip auto-generation
  IF NOT _all_submitted THEN
    RETURN NEW;
  END IF;

  -- Build payload for the generate-report Edge Function
  _payload := jsonb_build_object(
    'report_template_id', _report_template.id,
    'form_instance_ids', to_jsonb(_batch_instance_ids),
    'auto_generated', true
  );

  -- Fire async HTTP POST via pg_net
  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/generate-report',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_form_instance_submitted
  AFTER UPDATE ON public.form_instances
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND OLD.status != 'submitted')
  EXECUTE FUNCTION public.trigger_on_form_instance_submitted();


-- ============================================================
-- Trigger 2: Generate a Shlink short URL when a report instance
--            transitions from 'generating' to 'ready'.
--
-- Fires AFTER UPDATE on report_instances.
-- Calls the on-report-instance-ready Edge Function via pg_net
-- which creates a short URL and updates the report instance.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_report_instance_ready()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload JSONB;
BEGIN
  -- Only fire when status changes to 'ready'
  IF NEW.status != 'ready' OR OLD.status != 'generating' THEN
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'id', NEW.id,
    'readable_id', NEW.readable_id,
    'report_template_version_id', NEW.report_template_version_id
  );

  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/on-report-instance-ready',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_report_instance_ready
  AFTER UPDATE ON public.report_instances
  FOR EACH ROW
  WHEN (NEW.status = 'ready' AND OLD.status = 'generating')
  EXECUTE FUNCTION public.trigger_on_report_instance_ready();
