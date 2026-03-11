-- ============================================================
-- report_instances: immutable snapshots of resolved report data
-- status tracks generation progress (generating -> ready/failed)
-- ============================================================
CREATE TABLE public.report_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  readable_id TEXT NOT NULL UNIQUE,
  report_template_version_id UUID NOT NULL REFERENCES public.report_template_versions(id),
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
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

-- RLS: SELECT — Any authenticated active user can view report instances
CREATE POLICY report_instances_select ON public.report_instances
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
  );

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Report instances are created and updated by Edge Functions using the service role key.
-- The service_role in the TO clause allows Edge Functions to bypass RLS.

-- Index: find instances by template version
CREATE INDEX idx_report_instances_version
  ON public.report_instances (report_template_version_id);

-- Index: filter by status
CREATE INDEX idx_report_instances_status
  ON public.report_instances (status);
