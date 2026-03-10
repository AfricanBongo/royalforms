-- Add DELETE policies on template_sections and template_fields.
--
-- These tables had RLS enabled with SELECT and INSERT policies, but no DELETE
-- policy. This caused updateDraft() to silently fail to delete existing
-- sections before re-inserting, leading to duplicate sections accumulating
-- on every auto-save call.
--
-- The policy allows root_admin users to delete sections/fields that belong
-- to a draft version (either a never-published template's only version,
-- or a new draft version of a published template being edited).

-- DELETE policy on template_sections: root_admin can delete sections on draft versions
CREATE POLICY template_sections_delete ON public.template_sections
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND EXISTS (
    SELECT 1 FROM public.template_versions tv
    WHERE tv.id = template_sections.template_version_id
      AND tv.status = 'draft'
  )
);

-- DELETE policy on template_fields: root_admin can delete fields on draft versions
CREATE POLICY template_fields_delete ON public.template_fields
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND EXISTS (
    SELECT 1 FROM public.template_sections ts
    JOIN public.template_versions tv ON tv.id = ts.template_version_id
    WHERE ts.id = template_fields.template_section_id
      AND tv.status = 'draft'
  )
);
