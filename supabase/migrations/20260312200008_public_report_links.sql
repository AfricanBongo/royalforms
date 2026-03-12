-- Add is_public_default to report_templates (controls default for new instances)
ALTER TABLE public.report_templates
  ADD COLUMN is_public_default BOOLEAN NOT NULL DEFAULT true;

-- Add is_public to report_instances
ALTER TABLE public.report_instances
  ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true;

-- Anon SELECT policy: only public, ready instances
CREATE POLICY report_instances_public_select ON public.report_instances
  FOR SELECT TO anon
  USING (is_public = true AND status = 'ready');

-- Root admin can toggle is_public on instances
CREATE POLICY report_instances_toggle_public ON public.report_instances
  FOR UPDATE TO authenticated
  USING (
    is_active_user() = true
    AND get_current_user_role() = 'root_admin'
  )
  WITH CHECK (
    is_active_user() = true
    AND get_current_user_role() = 'root_admin'
  );
