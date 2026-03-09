-- Apply update_updated_at trigger to form instance tables
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.form_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.instance_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
