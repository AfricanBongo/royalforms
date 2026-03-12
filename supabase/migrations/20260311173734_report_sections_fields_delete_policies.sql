-- ============================================================
-- Add DELETE RLS policies to report_template_sections and
-- report_template_fields so the client SDK can delete-and-reinsert
-- sections/fields when saving a draft in-place.
-- ============================================================

CREATE POLICY report_template_sections_delete ON public.report_template_sections
  FOR DELETE TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');

CREATE POLICY report_template_fields_delete ON public.report_template_fields
  FOR DELETE TO authenticated, service_role
  USING (is_active_user() = true AND (select get_current_user_role()) = 'root_admin');
