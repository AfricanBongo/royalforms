-- template_sections: grouping of fields within a template version.
-- Each section renders as its own page when filling/viewing.
CREATE TABLE public.template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id UUID NOT NULL REFERENCES public.template_versions(id),
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_sections ENABLE ROW LEVEL SECURITY;

-- INSERT: Root Admin only
CREATE POLICY template_sections_insert ON public.template_sections
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- No UPDATE or DELETE — sections are immutable within a version.
-- SELECT policy deferred to after template_group_access table exists.
