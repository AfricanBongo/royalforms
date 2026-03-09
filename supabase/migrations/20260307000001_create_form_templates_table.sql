-- form_templates: structure definition for forms
-- Only Root Admin can create/edit. All active users can read based on sharing_mode.
CREATE TABLE public.form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sharing_mode TEXT NOT NULL DEFAULT 'all' CHECK (sharing_mode IN ('all', 'restricted')),
  instance_counter INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

-- INSERT: Root Admin only
CREATE POLICY form_templates_insert ON public.form_templates
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE: Root Admin only
CREATE POLICY form_templates_update ON public.form_templates
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- SELECT policy is added in a later migration after template_group_access exists.
