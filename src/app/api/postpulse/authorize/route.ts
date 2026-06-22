/** يبدأ ربط Post-Pulse: يولّد state ويحوّل المتصفح لصفحة التفويض. أدمن فقط. */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildAuthorizeUrl, postpulseConfigured } from '@/lib/postpulse'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  if (!postpulseConfigured()) {
    return NextResponse.json(
      { error: 'إعدادات Post-Pulse ناقصة (CLIENT_ID/SECRET/REDIRECT_URI) — أضِفها في البيئة' },
      { status: 500 }
    )
  }

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildAuthorizeUrl(state))
  res.cookies.set('pp_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 دقائق
  })
  return res
}
