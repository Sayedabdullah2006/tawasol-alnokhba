-- Adds storage for multiple content images attached to a publish request.
-- Paste in Supabase Dashboard → SQL Editor → Run

ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS content_images jsonb DEFAULT '[]';

-- Storage policy for the content-images bucket (uploads by authenticated users)
DROP POLICY IF EXISTS "authenticated_upload_content_images" ON storage.objects;
CREATE POLICY "authenticated_upload_content_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'content-images');
