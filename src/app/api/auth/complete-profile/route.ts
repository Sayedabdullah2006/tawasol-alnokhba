import { NextResponse } from 'next/server'
import { normalizeCustomerPhone } from '@/lib/customer-profile'
import { portalLoginDestination } from '@/lib/portal-login'
import { validSsoOrigin } from '@/lib/sso'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' }
  const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers })
  if (!validSsoOrigin(request)) return error('طلب غير مسموح.', 403)

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: identityError } = await supabase.auth.getUser()
  if (identityError && (identityError.status ?? 0) >= 500) return error('تعذّر التحقق من جلستك. حاول مرة أخرى.', 503)
  if (!user) return error('سجّل الدخول للمتابعة.', 401)

  const raw = await request.text()
  if (raw.length > 4096) return error('البيانات أكبر من المسموح.', 413)
  let body
  try { body = JSON.parse(raw) } catch { return error('تحقق من بيانات الملف.', 400) }
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const phone = typeof body?.phone === 'string' && body.phone.length <= 32 ? normalizeCustomerPhone(body.phone) : null
  if (name.length < 2 || name.length > 160) return error('أدخل الاسم الكامل.', 400)
  if (!phone) return error('أدخل رقم جوال صالحًا.', 400)

  const { data: profile, error: profileError } = await supabase.from('profiles').update({ full_name: name, phone })
    .eq('id', user.id).select('role').single()
  if (profileError || !profile) return error('تعذّر حفظ الملف. حاول مرة أخرى.', 503)

  const destination = portalLoginDestination(profile.role, typeof body.next === 'string' ? body.next : null)
  return NextResponse.json({ destination }, { headers })
}
