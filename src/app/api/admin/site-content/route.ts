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

// GET — يعيد محتوى الموقع القابل للتعديل (الشروط والأحكام + شروط قبول الخبر).
export async function GET() {
  const unauth = await requireAdmin()
  if (unauth) return unauth

  const service = await createServiceRoleClient()
  const { data, error } = await service
    .from('site_content')
    .select('*')
    .eq('id', 1)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ content: data })
}

// POST — يحدّث محتوى الموقع. ينعكس مباشرة على نموذج الطلب (يقرأه من القاعدة).
export async function POST(req: Request) {
  const unauth = await requireAdmin()
  if (unauth) return unauth

  let body: {
    termsText?: string
    newsConditionsGeneral?: string[]
    newsConditionsFooter?: string
    categoryConditions?: Record<string, string>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.termsText === 'string') upd.terms_text = body.termsText
  if (Array.isArray(body.newsConditionsGeneral)) {
    upd.news_conditions_general = body.newsConditionsGeneral
      .map(s => String(s).trim())
      .filter(Boolean)
  }
  if (typeof body.newsConditionsFooter === 'string') {
    upd.news_conditions_footer = body.newsConditionsFooter
  }
  if (body.categoryConditions && typeof body.categoryConditions === 'object') {
    const map: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.categoryConditions)) {
      const val = String(v ?? '').trim()
      if (val) map[k] = val // الفئات الفارغة تُحذف فلا يظهر لها شرط
    }
    upd.category_conditions = map
  }

  const service = await createServiceRoleClient()
  const { error } = await service.from('site_content').update(upd).eq('id', 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
