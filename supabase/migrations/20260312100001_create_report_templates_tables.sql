-- ============================================================
-- report_templates: 1:1 with form_templates. Root Admin only.
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

-- update_updated_at trigger (reuse existing function)
CREATE TRIGGER set_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- RLS: SELECT — Root Admin only
CREATE POLICY report_templates_select ON public.report_templates
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: INSERT — Root Admin only
CREATE POLICY report_templates_insert ON public.report_templates
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: UPDATE — Root Admin only
CREATE POLICY report_templates_update ON public.report_templates
  FOR UPDATE
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- ============================================================
-- report_template_versions: versioned snapshots of report templates
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

-- RLS: SELECT — Root Admin only
CREATE POLICY report_template_versions_select ON public.report_template_versions
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: INSERT — Root Admin only
CREATE POLICY report_template_versions_insert ON public.report_template_versions
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: UPDATE — Root Admin only (for is_latest toggling)
CREATE POLICY report_template_versions_update ON public.report_template_versions
  FOR UPDATE
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- Index: find latest version quickly
CREATE INDEX idx_report_template_versions_latest
  ON public.report_template_versions (report_template_id, is_latest)
  WHERE is_latest = true;
