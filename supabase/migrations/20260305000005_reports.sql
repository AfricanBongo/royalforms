-- ============================================================
-- Migration 5: Reports
-- Consolidated from: create_report_templates_tables,
--   report_template_content_tables, report_instances,
--   report_exports_bucket, report_triggers
-- ============================================================

-- ============================================================
-- REPORT TEMPLATES
-- ============================================================

CREATE TABLE public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id UUID NOT NULL UNIQUE REFERENCES public.form_templates(id),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_generate BOOLEAN NOT NULL DEFAULT false,
  instance_counter INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE POLICY report_templates_select ON public.report_templates
  FOR SELECT TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

CREATE POLICY report_templates_insert ON public.report_templates
  FOR INSERT TO authenticated, service_role
  WITH CHECK (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

CREATE POLICY report_templates_update ON public.report_templates
  FOR UPDATE TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

-- ============================================================
-- REPORT TEMPLATE VERSIONS
-- ============================================================

CREATE TABLE public.report_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_id UUID NOT NULL REFERENCES public.report_templates(id),
  version_number INTEGER NOT NULL,
  is_latest BOOLEAN NOT NULL DEFAULT true,
  restored_from UUID REFERENCES public.report_template_versions(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_template_id, version_number)
);

ALTER TABLE public.report_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_template_versions_select ON public.report_template_versions
  FOR SELECT TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

CREATE POLICY report_template_versions_insert ON public.report_template_versions
  FOR INSERT TO authenticated, service_role
  WITH CHECK (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

CREATE POLICY report_template_versions_update ON public.report_template_versions
  FOR UPDATE TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

CREATE INDEX idx_report_template_versions_latest
  ON public.report_template_versions (report_template_id, is_latest)
  WHERE is_latest = true;

-- ============================================================
-- REPORT TEMPLATE SECTIONS
-- ============================================================

CREATE TABLE public.report_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_version_id UUID NOT NULL REFERENCES public.report_template_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_template_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_template_sections_select ON public.report_template_sections
  FOR SELECT TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

CREATE POLICY report_template_sections_insert ON public.report_template_sections
  FOR INSERT TO authenticated, service_role
  WITH CHECK (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

-- ============================================================
-- REPORT TEMPLATE FIELDS
-- ============================================================

CREATE TABLE public.report_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_section_id UUID NOT NULL REFERENCES public.report_template_sections(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('formula', 'dynamic_variable', 'table', 'static_text')),
  sort_order INTEGER NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_template_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_template_fields_select ON public.report_template_fields
  FOR SELECT TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

CREATE POLICY report_template_fields_insert ON public.report_template_fields
  FOR INSERT TO authenticated, service_role
  WITH CHECK (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

-- ============================================================
-- REPORT INSTANCES
-- ============================================================

CREATE TABLE public.report_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  readable_id TEXT NOT NULL UNIQUE,
  report_template_version_id UUID NOT NULL REFERENCES public.report_template_versions(id),
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'ready', 'failed')),
  error_message TEXT,
  short_url TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  data_snapshot JSONB,
  form_instances_included JSONB NOT NULL,
  export_pdf_path TEXT,
  export_docx_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_instances_select ON public.report_instances
  FOR SELECT TO authenticated, service_role
  USING (is_active_user() = true);

CREATE INDEX idx_report_instances_version
  ON public.report_instances (report_template_version_id);

CREATE INDEX idx_report_instances_status
  ON public.report_instances (status);

-- ============================================================
-- REPORT EXPORTS STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('report-exports', 'report-exports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY report_exports_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-exports'
    AND (auth.jwt()->'user_metadata'->>'is_active')::boolean = true
  );

-- ============================================================
-- REPORT TRIGGERS
-- ============================================================

-- Trigger 1: Auto-generate report when all sibling form instances submitted
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
  IF NEW.status != 'submitted' OR OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT tv.template_id INTO _form_template_id
  FROM public.template_versions tv
  WHERE tv.id = NEW.template_version_id;

  IF _form_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT rt.id, rt.auto_generate INTO _report_template
  FROM public.report_templates rt
  WHERE rt.form_template_id = _form_template_id
    AND rt.is_active = true
    AND rt.auto_generate = true;

  IF _report_template IS NULL THEN
    RETURN NEW;
  END IF;

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

  IF NOT _all_submitted THEN
    RETURN NEW;
  END IF;

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

CREATE TRIGGER on_form_instance_submitted
  AFTER UPDATE ON public.form_instances
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND OLD.status != 'submitted')
  EXECUTE FUNCTION public.trigger_on_form_instance_submitted();

-- Trigger 2: Generate Shlink short URL when report instance is ready
CREATE OR REPLACE FUNCTION public.trigger_on_report_instance_ready()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload JSONB;
BEGIN
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
