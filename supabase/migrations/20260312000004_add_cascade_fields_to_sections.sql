-- Add ON DELETE CASCADE to template_fields → template_sections FK.
--
-- The updateDraft() function deletes all sections for a version then
-- re-inserts them. Without CASCADE on the fields FK, deleting a section
-- that still has fields throws:
--   "update or delete on table 'template_sections' violates foreign key
--    constraint 'template_fields_template_section_id_fkey'"
--
-- The previous cascade migration (20260312000002) added CASCADE for
-- template_sections → template_versions and template_versions → form_templates,
-- but missed template_fields → template_sections.

ALTER TABLE public.template_fields
  DROP CONSTRAINT template_fields_template_section_id_fkey,
  ADD CONSTRAINT template_fields_template_section_id_fkey
    FOREIGN KEY (template_section_id)
    REFERENCES public.template_sections(id)
    ON DELETE CASCADE;
