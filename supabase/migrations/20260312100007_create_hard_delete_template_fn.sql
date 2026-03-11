-- Transactional hard-delete for a form template and all related data.
-- Uses SECURITY DEFINER so RLS does not block intermediate deletes.
-- Deletion order respects FK constraints (leaf tables first).

CREATE OR REPLACE FUNCTION hard_delete_template(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Delete field_values for all instances belonging to this template
  DELETE FROM field_values
  WHERE form_instance_id IN (
    SELECT fi.id
    FROM form_instances fi
    JOIN template_versions tv ON fi.template_version_id = tv.id
    WHERE tv.template_id = p_template_id
  );

  -- 2. Delete form_instances (via template_versions)
  DELETE FROM form_instances
  WHERE template_version_id IN (
    SELECT id FROM template_versions WHERE template_id = p_template_id
  );

  -- 3. Delete schedule_group_targets (via instance_schedules)
  --    CASCADE would handle this, but explicit for clarity
  DELETE FROM schedule_group_targets
  WHERE schedule_id IN (
    SELECT id FROM instance_schedules WHERE template_id = p_template_id
  );

  -- 4. Delete instance_schedules
  DELETE FROM instance_schedules
  WHERE template_id = p_template_id;

  -- 5. Delete template_group_access
  DELETE FROM template_group_access
  WHERE template_id = p_template_id;

  -- 6. Delete form_templates row
  --    CASCADE handles: template_versions → template_sections → template_fields
  DELETE FROM form_templates
  WHERE id = p_template_id;
END;
$$;
