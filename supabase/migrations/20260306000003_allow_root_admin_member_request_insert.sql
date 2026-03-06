-- Allow root_admin to insert member requests for any group
DROP POLICY IF EXISTS member_requests_insert ON public.member_requests;

CREATE POLICY member_requests_insert ON public.member_requests
  FOR INSERT
  WITH CHECK (
    is_active_user() = true
    AND (
      -- Root Admin: can insert for any group, any valid role
      (get_current_user_role() = 'root_admin' AND proposed_role IN ('admin', 'editor', 'viewer'))
      OR
      -- Admin: can insert only for their own group
      (get_current_user_role() = 'admin' AND group_id = get_current_user_group_id() AND proposed_role IN ('admin', 'editor', 'viewer'))
    )
  );
