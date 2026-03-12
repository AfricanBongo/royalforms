-- ============================================================
-- Migration: Add draft/published status to report templates
-- Adds a status column to both report_templates and
-- report_template_versions to support a draft/published
-- lifecycle matching the form template pattern.
-- ============================================================

-- Add draft/published status to report_templates
ALTER TABLE public.report_templates
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Add draft/published status to report_template_versions
ALTER TABLE public.report_template_versions
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Set all existing rows to published (they were live before this migration)
UPDATE public.report_templates SET status = 'published';
UPDATE public.report_template_versions SET status = 'published';
