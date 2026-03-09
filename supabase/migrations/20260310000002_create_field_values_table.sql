-- field_values: lazily created rows for field data in form instances
CREATE TABLE public.field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_instance_id UUID NOT NULL REFERENCES public.form_instances(id),
  template_field_id UUID NOT NULL REFERENCES public.template_fields(id),
  value TEXT,
  updated_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  assigned_by UUID REFERENCES public.profiles(id),
  change_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_instance_id, template_field_id)
);

ALTER TABLE public.field_values ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see values for instances in their group.
CREATE POLICY field_values_select ON public.field_values
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_instances fi
      WHERE fi.id = field_values.form_instance_id
      AND fi.group_id = get_current_user_group_id()
    )
  )
);

-- INSERT: Admin/Editor of owning group, instance must be draft.
CREATE POLICY field_values_insert ON public.field_values
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);

-- UPDATE (open field): Unassigned field, Admin/Editor of owning group, draft instance.
CREATE POLICY field_values_update_open ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND assigned_to IS NULL
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);

-- UPDATE (assigned field): Only the assigned editor can edit.
CREATE POLICY field_values_update_assigned ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND assigned_to IS NOT NULL
  AND assigned_to = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.status = 'draft'
  )
);

-- UPDATE (admin assign): Admin of owning group can assign/reassign/unassign fields.
CREATE POLICY field_values_update_admin_assign ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);
