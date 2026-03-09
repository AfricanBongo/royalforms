-- Deferred SELECT policies for form template tables.
-- Created after template_group_access table exists (referenced in EXISTS subqueries).

-- form_templates: Root Admin sees all. Others see active templates they have access to.
CREATE POLICY form_templates_select ON public.form_templates
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR (
      is_active = true
      AND (
        sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = form_templates.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- template_versions: Root Admin sees all. Others see versions of accessible templates.
CREATE POLICY template_versions_select ON public.template_versions
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_templates ft
      WHERE ft.id = template_versions.template_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- template_sections: Root Admin sees all. Others see sections of accessible templates.
CREATE POLICY template_sections_select ON public.template_sections
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.template_versions tv
      JOIN public.form_templates ft ON ft.id = tv.template_id
      WHERE tv.id = template_sections.template_version_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- template_fields: Root Admin sees all. Others see fields of accessible templates.
CREATE POLICY template_fields_select ON public.template_fields
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.template_sections ts
      JOIN public.template_versions tv ON tv.id = ts.template_version_id
      JOIN public.form_templates ft ON ft.id = tv.template_id
      WHERE ts.id = template_fields.template_section_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);
