-- schedule_group_targets: which groups receive instances from a schedule
CREATE TABLE public.schedule_group_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.instance_schedules(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, group_id)
);

ALTER TABLE public.schedule_group_targets ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see rows for their group.
CREATE POLICY schedule_group_targets_select ON public.schedule_group_targets
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

-- INSERT: Root Admin only.
CREATE POLICY schedule_group_targets_insert ON public.schedule_group_targets
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- DELETE: Root Admin only (remove group from schedule).
CREATE POLICY schedule_group_targets_delete ON public.schedule_group_targets
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
