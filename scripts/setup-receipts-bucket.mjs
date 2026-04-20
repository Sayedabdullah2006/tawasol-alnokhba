import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env vars. Run with: node --env-file=.env.local scripts/setup-receipts-bucket.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BUCKET = 'receipts'

console.log(`Ensuring storage bucket "${BUCKET}" exists...`)

const { data: existing } = await supabase.storage.getBucket(BUCKET)

if (existing) {
  console.log(`✓ Bucket "${BUCKET}" already exists`)
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
  })
  if (error) {
    console.error(`✗ Failed to create bucket:`, error.message)
    process.exit(1)
  }
  console.log(`✓ Bucket "${BUCKET}" created`)
}

console.log('\nNote: Storage policies must be set in Supabase Dashboard:')
console.log('  Storage → receipts → Policies')
console.log('  • INSERT policy: "authenticated users can upload"')
console.log('      (auth.role() = \'authenticated\')')
console.log('  • SELECT policy: "admin can read all" or use signed URLs')
console.log('\nDone.')
process.exit(0)
