-- Foreign key indexes for form template tables.
-- Indexes on FK columns improve JOIN and RLS policy performance.
CREATE INDEX idx_form_templates_created_by ON public.form_templates(created_by);
CREATE INDEX idx_template_versions_template_id ON public.template_versions(template_id);
CREATE INDEX idx_template_versions_created_by ON public.template_versions(created_by);
CREATE INDEX idx_template_versions_restored_from ON public.template_versions(restored_from);
CREATE INDEX idx_template_sections_template_version_id ON public.template_sections(template_version_id);
CREATE INDEX idx_template_fields_template_section_id ON public.template_fields(template_section_id);
CREATE INDEX idx_template_group_access_template_id ON public.template_group_access(template_id);
CREATE INDEX idx_template_group_access_group_id ON public.template_group_access(group_id);
