-- ============================================================
-- Add admin_only_submit column to form_instances
-- ============================================================
-- When true, only admin (and root_admin) can submit the form.
-- When false (default), both admin and editor can submit.

ALTER TABLE public.form_instances
  ADD COLUMN admin_only_submit boolean NOT NULL DEFAULT false;

-- ============================================================
-- Replace the submit RLS policy to allow editor + admin
-- ============================================================
-- The old policy only allowed admin. The new policy allows both
-- admin and editor, but when admin_only_submit = true only admin
-- can submit.

DROP POLICY IF EXISTS form_instances_update_submit ON public.form_instances;

CREATE POLICY form_instances_update_submit ON public.form_instances
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND group_id = get_current_user_group_id()
  AND status = 'pending'
  AND (
    -- Admin can always submit
    get_current_user_role() = 'admin'
    OR
    -- Editor can submit only when admin_only_submit is false
    (get_current_user_role() = 'editor' AND admin_only_submit = false)
  )
);
