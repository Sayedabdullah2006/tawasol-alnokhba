-- Storage policies for the "receipts" bucket
-- Paste in Supabase Dashboard → SQL Editor → Run

-- Allow authenticated users to upload to the receipts bucket
DROP POLICY IF EXISTS "authenticated_upload_receipts" ON storage.objects;
CREATE POLICY "authenticated_upload_receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

-- Allow authenticated users to read their own uploads
-- (admin code reads via service role through signed URLs, so this is for safety)
DROP POLICY IF EXISTS "users_read_own_receipts" ON storage.objects;
CREATE POLICY "users_read_own_receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND owner = auth.uid());

-- Allow admins to read every receipt
DROP POLICY IF EXISTS "admin_read_all_receipts" ON storage.objects;
CREATE POLICY "admin_read_all_receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
