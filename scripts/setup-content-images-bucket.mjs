import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env vars. Run with: node --env-file=.env.local scripts/setup-content-images-bucket.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BUCKET = 'content-images'

const { data: existing } = await supabase.storage.getBucket(BUCKET)

if (existing) {
  console.log(`✓ Bucket "${BUCKET}" already exists`)
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
  })
  if (error) {
    console.error('✗ Failed:', error.message)
    process.exit(1)
  }
  console.log(`✓ Bucket "${BUCKET}" created (public)`)
}

console.log('\nThen run this in Supabase SQL Editor for INSERT policy:')
console.log(`
DROP POLICY IF EXISTS "authenticated_upload_content_images" ON storage.objects;
CREATE POLICY "authenticated_upload_content_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'content-images');
`)
process.exit(0)
