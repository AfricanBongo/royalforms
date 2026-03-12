-- Allow root_admin and admin to delete report instances via RLS.
-- The actual deletion (including Shlink + Storage cleanup) is handled by
-- the delete-report-instance Edge Function, but the final DB delete uses
-- the service_role key so this policy is a safety net for direct SDK usage.

CREATE POLICY report_instances_delete ON public.report_instances
  FOR DELETE TO authenticated
  USING (
    is_active_user() = true
    AND get_current_user_role() IN ('root_admin', 'admin')
  );
