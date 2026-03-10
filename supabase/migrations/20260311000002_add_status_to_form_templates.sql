-- Add status column to form_templates (draft | published)
ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Backfill: all existing templates are published (they were created via Publish)
UPDATE public.form_templates SET status = 'published' WHERE status = 'draft';

-- Must DROP and recreate view because adding a column in the middle
-- changes positional mapping (CREATE OR REPLACE cannot rename columns).
DROP VIEW IF EXISTS public.templates_with_stats;

CREATE VIEW public.templates_with_stats AS
SELECT
  ft.id,
  ft.name,
  ft.abbreviation,
  ft.description,
  ft.sharing_mode,
  ft.status,
  ft.is_active,
  ft.created_at,
  ft.updated_at,
  COALESCE(lv.version_number, 0)  AS latest_version,
  COALESCE(ic.submitted_count, 0) AS submitted_count,
  COALESCE(ic.pending_count, 0)   AS pending_count
FROM public.form_templates ft
LEFT JOIN LATERAL (
  SELECT tv.version_number
  FROM public.template_versions tv
  WHERE tv.template_id = ft.id
    AND tv.is_latest = true
  LIMIT 1
) lv ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE fi.status = 'submitted') AS submitted_count,
    COUNT(*) FILTER (WHERE fi.status = 'draft')     AS pending_count
  FROM public.form_instances fi
  INNER JOIN public.template_versions tv2
    ON tv2.id = fi.template_version_id
  WHERE tv2.template_id = ft.id
    AND fi.is_archived = false
) ic ON true;

COMMENT ON VIEW public.templates_with_stats IS
  'Template list with status, latest version number and instance counts.';
