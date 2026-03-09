-- form_instances: runtime copy of a template version, owned by a group
CREATE TABLE public.form_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  readable_id TEXT NOT NULL UNIQUE,
  template_version_id UUID NOT NULL REFERENCES public.template_versions(id),
  group_id UUID NOT NULL REFERENCES public.groups(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  short_url_view TEXT,
  short_url_edit TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  submitted_by UUID REFERENCES public.profiles(id),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_instances ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see instances belonging to their group.
CREATE POLICY form_instances_select ON public.form_instances
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

-- INSERT: Root Admin only (one-time instances).
CREATE POLICY form_instances_insert ON public.form_instances
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE (submit): Admin of owning group can submit draft instances.
CREATE POLICY form_instances_update_submit ON public.form_instances
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND group_id = get_current_user_group_id()
  AND status = 'draft'
);

-- UPDATE (root admin): Can archive instances.
CREATE POLICY form_instances_update_root_admin ON public.form_instances
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
