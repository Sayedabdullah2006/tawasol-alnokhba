/**
 * معالج رد نداء OAuth من Post-Pulse — يُستخدم من /oauth/callback و /callback.
 * يتحقق من الأدمن وحالة CSRF ثم يبدّل الرمز بتوكن ويخزّنه. لا ينشر شيئاً.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { exchangeCodeForToken, PP_REDIRECT_URI } from '@/lib/postpulse'

export async function handlePostpulseCallback(req: Request): Promise<NextResponse> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  // نبني إعادة التوجيه من العنوان العام (redirect_uri) لا من عنوان الطلب الداخلي
  // خلف بروكسي الاستضافة (وإلا تذهب إلى localhost:8080).
  const base = new URL(PP_REDIRECT_URI).origin
  const dest = (q: string) => NextResponse.redirect(new URL(`/admin/integrations${q}`, base))

  // أدمن فقط
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', base))
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.redirect(new URL('/dashboard', base))

  if (oauthError) return dest(`?error=${encodeURIComponent(oauthError)}`)
  if (!code) return dest('?error=missing_code')

  // تحقق CSRF عبر كوكي الحالة
  const cookieState = req.headers.get('cookie')?.match(/pp_oauth_state=([^;]+)/)?.[1]
  if (!cookieState || cookieState !== state) return dest('?error=state_mismatch')

  try {
    await exchangeCodeForToken(code)
  } catch (e) {
    return dest(`?error=${encodeURIComponent(e instanceof Error ? e.message : 'exchange_failed')}`)
  }

  const res = dest('?connected=1')
  res.cookies.set('pp_oauth_state', '', { maxAge: 0, path: '/' })
  return res
}
