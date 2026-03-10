-- Add description (subtitle) column to template_fields
ALTER TABLE public.template_fields
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.template_fields.description IS
  'Optional subtitle/description shown below the field label.';
