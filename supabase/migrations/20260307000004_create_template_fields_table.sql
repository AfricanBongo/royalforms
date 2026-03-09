-- template_fields: individual fields within a section.
CREATE TABLE public.template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_section_id UUID NOT NULL REFERENCES public.template_sections(id),
  label TEXT NOT NULL,
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

-- INSERT: Root Admin only
CREATE POLICY template_fields_insert ON public.template_fields
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- No UPDATE or DELETE — fields are immutable within a version.
-- SELECT policy deferred to after template_group_access table exists.
