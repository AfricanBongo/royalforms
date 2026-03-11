-- Storage policies for the 'form-uploads' bucket.
-- Path pattern: {instance_id}/{field_id}/{timestamp}-{filename}
-- Access: authenticated users who belong to the instance's group.

-- Upload: authenticated users can upload to form-uploads
-- (Fine-grained access via group membership is handled at the application level;
--  RLS here ensures only authenticated users can interact with the bucket)
CREATE POLICY "Authenticated users can upload form files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'form-uploads');

-- Download: authenticated users can read form files
CREATE POLICY "Authenticated users can read form files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'form-uploads');

-- Delete: authenticated users can delete form files
CREATE POLICY "Authenticated users can delete form files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'form-uploads');

-- Update: authenticated users can update form files
CREATE POLICY "Authenticated users can update form files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'form-uploads')
  WITH CHECK (bucket_id = 'form-uploads');
