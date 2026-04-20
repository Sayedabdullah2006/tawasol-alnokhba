import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env vars. Run with: node --env-file=.env.local scripts/create-admin.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const ADMIN_EMAIL = 'admin@ksa-influencers.com'
const ADMIN_PASSWORD = 'Admin@2025!'
const ADMIN_NAME = 'مدير المنصة'

async function main() {
  console.log('🔄 Creating admin user...')

  // Create user via admin API
  const { data: userData, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: ADMIN_NAME },
  })

  if (createError) {
    if (createError.message.includes('already been registered')) {
      console.log('ℹ️  User already exists, updating role...')
      // Find existing user
      const { data: users } = await supabase.auth.admin.listUsers()
      const existing = users?.users?.find(u => u.email === ADMIN_EMAIL)
      if (existing) {
        await supabase.from('profiles').upsert({
          id: existing.id,
          full_name: ADMIN_NAME,
          role: 'admin',
        })
        console.log('✅ Admin role updated!')
        console.log(`📧 Email: ${ADMIN_EMAIL}`)
        console.log(`🔑 Password: ${ADMIN_PASSWORD}`)
        return
      }
    }
    console.error('❌ Error:', createError.message)
    process.exit(1)
  }

  console.log('✅ User created:', userData.user.id)

  // Set admin role in profiles
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userData.user.id,
    full_name: ADMIN_NAME,
    role: 'admin',
  })

  if (profileError) {
    console.error('⚠️  Profile error:', profileError.message)
    console.log('Try running the SQL schema first, then re-run this script.')
  } else {
    console.log('✅ Admin profile created!')
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  بيانات حساب الأدمن:')
  console.log(`  📧 Email:    ${ADMIN_EMAIL}`)
  console.log(`  🔑 Password: ${ADMIN_PASSWORD}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
