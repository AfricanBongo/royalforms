-- Indexes on FK columns for form instance tables (performance)
-- form_instances
CREATE INDEX idx_form_instances_template_version_id ON public.form_instances(template_version_id);
CREATE INDEX idx_form_instances_group_id ON public.form_instances(group_id);
CREATE INDEX idx_form_instances_created_by ON public.form_instances(created_by);
CREATE INDEX idx_form_instances_submitted_by ON public.form_instances(submitted_by);
CREATE INDEX idx_form_instances_status ON public.form_instances(status);

-- field_values (unique constraint on form_instance_id + template_field_id already creates a composite index)
CREATE INDEX idx_field_values_updated_by ON public.field_values(updated_by);
CREATE INDEX idx_field_values_assigned_to ON public.field_values(assigned_to);

-- instance_schedules (template_id has UNIQUE constraint, already indexed)
CREATE INDEX idx_instance_schedules_created_by ON public.instance_schedules(created_by);
