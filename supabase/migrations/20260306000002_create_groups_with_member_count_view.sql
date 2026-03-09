-- View: groups_with_member_count
-- Replaces the N+1 query pattern by joining groups with a profile count subquery.
CREATE OR REPLACE VIEW public.groups_with_member_count AS
SELECT
  g.id,
  g.name,
  g.is_active,
  g.created_at,
  g.created_by,
  COALESCE(pc.member_count, 0)::int AS member_count
FROM public.groups g
LEFT JOIN (
  SELECT group_id, COUNT(*)::int AS member_count
  FROM public.profiles
  WHERE is_active = true
  GROUP BY group_id
) pc ON pc.group_id = g.id;

-- Grant access to the view
GRANT SELECT ON public.groups_with_member_count TO anon, authenticated;

-- RLS: Use security_invoker so RLS on `groups` and `profiles` tables applies.
ALTER VIEW public.groups_with_member_count SET (security_invoker = on);
