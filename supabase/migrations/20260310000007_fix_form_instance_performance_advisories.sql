-- Fix performance advisories from supabase_get_advisors

-- 1. Add missing FK index on field_values.assigned_by
CREATE INDEX idx_field_values_assigned_by ON public.field_values(assigned_by);

-- 2. Add missing FK index on schedule_group_targets.group_id
CREATE INDEX idx_schedule_group_targets_group_id ON public.schedule_group_targets(group_id);

-- 3. Fix auth.uid() in field_values_update_assigned to use subquery (avoids per-row re-evaluation)
DROP POLICY field_values_update_assigned ON public.field_values;

CREATE POLICY field_values_update_assigned ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND assigned_to IS NOT NULL
  AND assigned_to = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.status = 'draft'
  )
);
