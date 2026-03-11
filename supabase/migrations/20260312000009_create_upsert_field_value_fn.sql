-- Atomic upsert for field values with change_log append.
-- Eliminates the read-modify-write race condition on change_log.
CREATE OR REPLACE FUNCTION public.upsert_field_value(
  p_instance_id UUID,
  p_field_id UUID,
  p_value TEXT,
  p_old_value TEXT,
  p_user_id UUID
) RETURNS SETOF public.field_values
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_entry JSONB;
BEGIN
  v_log_entry := jsonb_build_object(
    'old_value', p_old_value,
    'new_value', p_value,
    'changed_by', p_user_id::text,
    'changed_at', now()::text
  );

  RETURN QUERY
  INSERT INTO public.field_values (form_instance_id, template_field_id, value, updated_by, change_log)
  VALUES (p_instance_id, p_field_id, p_value, p_user_id, jsonb_build_array(v_log_entry))
  ON CONFLICT (form_instance_id, template_field_id) DO UPDATE SET
    value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    change_log = field_values.change_log || jsonb_build_array(v_log_entry)
  RETURNING *;
END;
$$;
