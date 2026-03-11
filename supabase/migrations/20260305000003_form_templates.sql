-- ============================================================
-- Migration 3: Form Templates
-- Consolidated from: create_form_templates_table, template_versions,
--   template_sections, template_fields, template_group_access,
--   add_form_template_select_policies, triggers, indexes,
--   add_description, add_status, remove_abbreviation,
--   version_status_and_cascades, delete_policies, cascade_fields,
--   role_targets, increase_readable_id
-- ============================================================

-- ============================================================
-- FORM TEMPLATES
-- ============================================================

CREATE TABLE public.form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sharing_mode TEXT NOT NULL DEFAULT 'all' CHECK (sharing_mode IN ('all', 'restricted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_form_templates_updated_at
  BEFORE UPDATE ON public.form_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- TEMPLATE VERSIONS
-- ============================================================

CREATE TABLE public.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_latest BOOLEAN NOT NULL DEFAULT true,
  restored_from UUID REFERENCES public.template_versions(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TEMPLATE SECTIONS
-- ============================================================

CREATE TABLE public.template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id UUID NOT NULL REFERENCES public.template_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_sections ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TEMPLATE FIELDS
-- ============================================================

CREATE TABLE public.template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_section_id UUID NOT NULL REFERENCES public.template_sections(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT,
  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'textarea', 'number', 'date',
    'select', 'multi_select', 'checkbox',
    'rating', 'range', 'file'
  )),
  sort_order INTEGER NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB,
  validation_rules JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_fields ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TEMPLATE GROUP ACCESS (junction table for restricted sharing)
-- ============================================================

CREATE TABLE public.template_group_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.form_templates(id),
  group_id UUID NOT NULL REFERENCES public.groups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, group_id)
);

ALTER TABLE public.template_group_access ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FK INDEXES
-- ============================================================

CREATE INDEX idx_form_templates_created_by ON public.form_templates(created_by);
CREATE INDEX idx_template_versions_template_id ON public.template_versions(template_id);
CREATE INDEX idx_template_versions_created_by ON public.template_versions(created_by);
CREATE INDEX idx_template_versions_restored_from ON public.template_versions(restored_from);
CREATE INDEX idx_template_sections_template_version_id ON public.template_sections(template_version_id);
CREATE INDEX idx_template_fields_template_section_id ON public.template_fields(template_section_id);
CREATE INDEX idx_template_group_access_template_id ON public.template_group_access(template_id);
CREATE INDEX idx_template_group_access_group_id ON public.template_group_access(group_id);

-- ============================================================
-- RLS POLICIES — form_templates
-- ============================================================

CREATE POLICY form_templates_select ON public.form_templates
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR (
      is_active = true
      AND (
        sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = form_templates.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

CREATE POLICY form_templates_insert ON public.form_templates
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY form_templates_update ON public.form_templates
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY form_templates_delete ON public.form_templates
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND status = 'draft'
);

-- ============================================================
-- RLS POLICIES — template_versions
-- ============================================================

CREATE POLICY template_versions_select ON public.template_versions
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_templates ft
      WHERE ft.id = template_versions.template_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

CREATE POLICY template_versions_insert ON public.template_versions
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY template_versions_update ON public.template_versions
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY template_versions_delete ON public.template_versions
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND status = 'draft'
);

-- ============================================================
-- RLS POLICIES — template_sections
-- ============================================================

CREATE POLICY template_sections_select ON public.template_sections
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.template_versions tv
      JOIN public.form_templates ft ON ft.id = tv.template_id
      WHERE tv.id = template_sections.template_version_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

CREATE POLICY template_sections_insert ON public.template_sections
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY template_sections_delete ON public.template_sections
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND EXISTS (
    SELECT 1 FROM public.template_versions tv
    WHERE tv.id = template_sections.template_version_id
      AND tv.status = 'draft'
  )
);

-- ============================================================
-- RLS POLICIES — template_fields
-- ============================================================

CREATE POLICY template_fields_select ON public.template_fields
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.template_sections ts
      JOIN public.template_versions tv ON tv.id = ts.template_version_id
      JOIN public.form_templates ft ON ft.id = tv.template_id
      WHERE ts.id = template_fields.template_section_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

CREATE POLICY template_fields_insert ON public.template_fields
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY template_fields_delete ON public.template_fields
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND EXISTS (
    SELECT 1 FROM public.template_sections ts
    JOIN public.template_versions tv ON tv.id = ts.template_version_id
    WHERE ts.id = template_fields.template_section_id
      AND tv.status = 'draft'
  )
);

-- ============================================================
-- RLS POLICIES — template_group_access
-- ============================================================

CREATE POLICY template_group_access_select ON public.template_group_access
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

CREATE POLICY template_group_access_insert ON public.template_group_access
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

CREATE POLICY template_group_access_delete ON public.template_group_access
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
