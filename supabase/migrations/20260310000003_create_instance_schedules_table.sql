-- instance_schedules: one schedule per template for recurring instance creation
CREATE TABLE public.instance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL UNIQUE REFERENCES public.form_templates(id),
  start_date DATE NOT NULL,
  repeat_interval TEXT NOT NULL CHECK (repeat_interval IN ('daily', 'weekly', 'bi_weekly', 'monthly')),
  repeat_every INTEGER NOT NULL DEFAULT 1,
  days_of_week JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instance_schedules ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see schedules for templates they can access.
CREATE POLICY instance_schedules_select ON public.instance_schedules
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_templates ft
      WHERE ft.id = instance_schedules.template_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tta
          WHERE tta.template_id = ft.id
          AND tta.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- INSERT: Root Admin only.
CREATE POLICY instance_schedules_insert ON public.instance_schedules
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE: Root Admin only.
CREATE POLICY instance_schedules_update ON public.instance_schedules
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
