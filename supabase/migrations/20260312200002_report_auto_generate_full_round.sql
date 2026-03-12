-- Migration: Update auto-generate trigger to check full round
-- 
-- Previously the trigger only checked if all form instances for the
-- SUBMITTING GROUP were submitted. Now it checks if ALL form instances
-- across ALL groups for the same form template on the same day are
-- submitted (the entire "round").
--
-- Also adds rt.status = 'published' check so only published report
-- templates can auto-generate.

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
  -- Only proceed when status transitions to 'submitted'
  IF NEW.status != 'submitted' OR OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;

  -- Resolve the form template id from the template version
  SELECT tv.template_id INTO _form_template_id
  FROM public.template_versions tv
  WHERE tv.id = NEW.template_version_id;

  IF _form_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find an active, published, auto-generate report template for this form
  SELECT rt.id, rt.auto_generate INTO _report_template
  FROM public.report_templates rt
  WHERE rt.form_template_id = _form_template_id
    AND rt.is_active = true
    AND rt.auto_generate = true
    AND rt.status = 'published';

  IF _report_template IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if ALL form instances for this form template on this date
  -- across ALL groups are submitted (full round check)
  SELECT
    bool_and(fi.status = 'submitted'),
    array_agg(fi.id)
  INTO _all_submitted, _batch_instance_ids
  FROM public.form_instances fi
  WHERE fi.template_version_id IN (
      SELECT tv.id FROM public.template_versions tv
      WHERE tv.template_id = _form_template_id
    )
    AND fi.created_at::date = NEW.created_at::date
    AND fi.is_archived = false;

  IF NOT _all_submitted THEN
    RETURN NEW;
  END IF;

  -- All instances in the round are submitted — trigger report generation
  _payload := jsonb_build_object(
    'report_template_id', _report_template.id,
    'form_instance_ids', to_jsonb(_batch_instance_ids),
    'auto_generated', true
  );

  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/generate-report',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;
