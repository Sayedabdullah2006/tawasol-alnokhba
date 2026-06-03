import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Shared admin-auth guard. Returns null when the caller is an admin,
// otherwise a NextResponse error to short-circuit the handler.
async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  return null
}

// GET — returns the current First1Saudi logo URL.
export async function GET() {
  const unauth = await requireAdmin()
  if (unauth) return unauth

  const service = await createServiceRoleClient()
  const { data, error } = await service
    .from('brand_settings')
    .select('first1saudi_logo_url')
    .eq('id', 1)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logoUrl: data?.first1saudi_logo_url ?? null })
}

// POST — updates the logo URL (the file is uploaded client-side first).
export async function POST(req: Request) {
  const unauth = await requireAdmin()
  if (unauth) return unauth

  let body: { logoUrl?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  const logoUrl = body.logoUrl
  if (!logoUrl || typeof logoUrl !== 'string') {
    return NextResponse.json({ error: 'رابط الشعار مطلوب' }, { status: 400 })
  }

  const service = await createServiceRoleClient()
  const { error } = await service
    .from('brand_settings')
    .update({
      first1saudi_logo_url: logoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, logoUrl })
}
