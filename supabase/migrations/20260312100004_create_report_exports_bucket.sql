-- ============================================================
-- Storage bucket for report PDF/DOCX exports
-- ============================================================

-- Create the bucket (private by default — requires auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-exports', 'report-exports', false);

-- RLS: Any authenticated active user can download (SELECT) exports
CREATE POLICY report_exports_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-exports'
    AND (auth.jwt()->'user_metadata'->>'is_active')::boolean = true
  );

-- RLS: Service role can upload (INSERT) exports
-- No authenticated INSERT policy — only Edge Functions upload via service role key.
-- The service role bypasses RLS so no explicit INSERT policy is needed.

-- RLS: Service role can update (UPDATE) exports
-- Same as INSERT — only Edge Functions update via service role key.
