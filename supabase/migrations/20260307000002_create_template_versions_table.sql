-- template_versions: snapshot of a template at a point in time.
-- Existing instances stay pinned to their version.
CREATE TABLE public.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.form_templates(id),
  version_number INTEGER NOT NULL,
  is_latest BOOLEAN NOT NULL DEFAULT true,
  restored_from UUID REFERENCES public.template_versions(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;

-- INSERT: Root Admin only
CREATE POLICY template_versions_insert ON public.template_versions
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE: Root Admin only (for toggling is_latest)
CREATE POLICY template_versions_update ON public.template_versions
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- SELECT policy deferred to after template_group_access table exists.
