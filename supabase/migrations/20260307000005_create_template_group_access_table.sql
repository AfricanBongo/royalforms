-- template_group_access: junction table for restricted template sharing.
-- When form_templates.sharing_mode = 'restricted', only groups listed here can access.
CREATE TABLE public.template_group_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.form_templates(id),
  group_id UUID NOT NULL REFERENCES public.groups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, group_id)
);

ALTER TABLE public.template_group_access ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see rows matching their group.
CREATE POLICY template_group_access_select ON public.template_group_access
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

-- INSERT: Root Admin only
CREATE POLICY template_group_access_insert ON public.template_group_access
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- DELETE: Root Admin only (for revoking group access)
CREATE POLICY template_group_access_delete ON public.template_group_access
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
