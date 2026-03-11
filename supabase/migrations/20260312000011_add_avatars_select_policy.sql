-- Add SELECT policy for avatars bucket.
-- The bucket is public (anonymous reads via public URL), but authenticated
-- operations like upsert need SELECT access on storage.objects to check
-- whether the file already exists. Without this policy, upsert fails with
-- an RLS violation.

CREATE POLICY "Users can read own avatar"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
