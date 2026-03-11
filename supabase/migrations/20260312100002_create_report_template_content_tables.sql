-- ============================================================
-- report_template_sections: sections within a report template version
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

-- RLS: SELECT — Root Admin only
CREATE POLICY report_template_sections_select ON public.report_template_sections
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: INSERT — Root Admin only
CREATE POLICY report_template_sections_insert ON public.report_template_sections
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- ============================================================
-- report_template_fields: fields within a report template section
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

-- RLS: SELECT — Root Admin only
CREATE POLICY report_template_fields_select ON public.report_template_fields
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: INSERT — Root Admin only
CREATE POLICY report_template_fields_insert ON public.report_template_fields
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );
