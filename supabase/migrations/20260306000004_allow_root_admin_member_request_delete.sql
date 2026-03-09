-- Allow root_admin to delete member_requests.
-- Used for client-side rollback when the invite-user Edge Function fails
-- after the audit row has already been inserted.
CREATE POLICY member_requests_delete
  ON public.member_requests
  FOR DELETE
  USING (
    is_active_user() = true
    AND get_current_user_role() = 'root_admin'
  );
