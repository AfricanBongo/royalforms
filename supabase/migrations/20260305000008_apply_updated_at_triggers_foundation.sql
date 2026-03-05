-- Apply update_updated_at trigger to all foundation tables

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_member_requests_updated_at
  BEFORE UPDATE ON public.member_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
