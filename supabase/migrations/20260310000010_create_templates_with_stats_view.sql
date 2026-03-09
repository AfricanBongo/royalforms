-- View: templates_with_stats
-- Joins form_templates with their latest version number
-- and instance counts (submitted / pending) for the template list page.

CREATE OR REPLACE VIEW public.templates_with_stats AS
SELECT
  ft.id,
  ft.name,
  ft.abbreviation,
  ft.description,
  ft.sharing_mode,
  ft.is_active,
  ft.created_at,
  ft.updated_at,
  COALESCE(lv.version_number, 0)  AS latest_version,
  COALESCE(ic.submitted_count, 0) AS submitted_count,
  COALESCE(ic.pending_count, 0)   AS pending_count
FROM public.form_templates ft
-- Latest version per template
LEFT JOIN LATERAL (
  SELECT tv.version_number
  FROM public.template_versions tv
  WHERE tv.template_id = ft.id
    AND tv.is_latest = true
  LIMIT 1
) lv ON true
-- Instance counts per template (across ALL versions of this template)
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

-- Grant access so RLS on the underlying tables still applies via the view
-- Views in Supabase use the caller's permissions by default (SECURITY INVOKER).
COMMENT ON VIEW public.templates_with_stats IS
  'Template list with latest version number and instance counts (submitted/pending).';
