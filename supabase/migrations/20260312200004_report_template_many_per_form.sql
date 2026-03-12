-- Migration: Allow many report templates per form template (1-to-many)
--
-- Drops the UNIQUE constraint on report_templates.form_template_id
-- so multiple report templates can reference the same form template.
--
-- Also updates the auto-generate trigger to loop over ALL matching
-- report templates instead of picking just one.

-- 1. Drop the UNIQUE constraint
ALTER TABLE public.report_templates
  DROP CONSTRAINT IF EXISTS report_templates_form_template_id_key;

-- 2. Add a plain index for FK lookup performance (the UNIQUE doubled as one)
CREATE INDEX IF NOT EXISTS idx_report_templates_form_template_id
  ON public.report_templates (form_template_id);

-- 3. Replace the trigger function to handle multiple report templates
CREATE OR REPLACE FUNCTION public.trigger_on_form_instance_submitted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _rt RECORD;
  _all_submitted BOOLEAN;
  _batch_instance_ids UUID[];
  _payload JSONB;
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

  -- Loop over ALL active, published, auto-generate report templates
  FOR _rt IN
    SELECT rt.id
    FROM public.report_templates rt
    WHERE rt.form_template_id = _form_template_id
      AND rt.is_active = true
      AND rt.auto_generate = true
      AND rt.status = 'published'
  LOOP
    _payload := jsonb_build_object(
      'report_template_id', _rt.id,
      'form_instance_ids', to_jsonb(_batch_instance_ids),
      'auto_generated', true
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/generate-report',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
  END LOOP;

  RETURN NEW;
END;
$$;
