-- Enable Supabase Realtime for field_values and form_instances tables.
-- Required for real-time sync on the instance page.
ALTER PUBLICATION supabase_realtime ADD TABLE public.field_values;
ALTER PUBLICATION supabase_realtime ADD TABLE public.form_instances;
