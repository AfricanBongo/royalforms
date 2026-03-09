-- Apply update_updated_at trigger to form template tables that have updated_at columns.
-- Only form_templates has updated_at in this batch (versions, sections, fields don't).
CREATE TRIGGER set_form_templates_updated_at
  BEFORE UPDATE ON public.form_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
