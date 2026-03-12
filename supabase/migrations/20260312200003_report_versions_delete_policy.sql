-- ============================================================
-- Add DELETE RLS policy to report_template_versions so the
-- client SDK can delete draft versions when discarding.
-- ============================================================

CREATE POLICY report_template_versions_delete ON public.report_template_versions
  FOR DELETE TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');
