import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { APPLE_PAY_DOMAIN_ASSOCIATION } from '@/lib/apple-pay-domain'
import {publicAuthUrl} from '@/lib/auth-origin'
import {requireActiveAuthSession} from '@/lib/active-auth-session'

export async function proxy(request: NextRequest) {
  // ملف ربط نطاق Apple Pay — يُخدَم هنا لأن هذا البناء لا يخدم public/.well-known
  if (request.nextUrl.pathname === '/.well-known/apple-developer-merchantid-domain-association') {
    return new NextResponse(APPLE_PAY_DOMAIN_ASSOCIATION, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = requireActiveAuthSession(createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookieOptions:{sameSite:'lax',secure:process.env.NODE_ENV==='production'},
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers??{}).forEach(([name,value])=>supabaseResponse.headers.set(name,value))
        },
      },
    }
  ))

  const { data: { user },error } = await supabase.auth.getUser()
  if(error?.code==='session_not_found')await supabase.auth.signOut({scope:'local'})
  const pathname = request.nextUrl.pathname

  // Protected routes — require login.
  // تقديم الطلب والدفع يتطلّبان تسجيل الدخول (لتعزيز الثقة وربط الطلب بحساب موثّق).
  const protectedPath =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/employee') ||
    pathname.startsWith('/request') ||
    pathname.startsWith('/payment')

  if (protectedPath && !user) {
    const url = publicAuthUrl('/auth/login')
    // إعادة العميل إلى وجهته بعد تسجيل الدخول
    url.search = ''
    url.searchParams.set('next', pathname + request.nextUrl.search)
    const redirect=NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(cookie=>redirect.cookies.set(cookie))
    redirect.headers.set('Cache-Control','private, no-store, max-age=0')
    return redirect
  }

  supabaseResponse.headers.set('Cache-Control','private, no-store, max-age=0')
  supabaseResponse.headers.set('Pragma','no-cache')
  supabaseResponse.headers.set('Expires','0')
  return supabaseResponse
}

export const config = {
  matcher: [
    '/auth/:path*',
    '/oauth/consent',
    '/dashboard/:path*',
    '/admin/:path*',
    '/employee/:path*',
    '/request',
    '/request/:path*',
    '/payment/:path*',
    '/.well-known/apple-developer-merchantid-domain-association',
  ],
}
