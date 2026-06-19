import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { APPLE_PAY_DOMAIN_ASSOCIATION } from '@/lib/apple-pay-domain'

export async function proxy(request: NextRequest) {
  // ملف ربط نطاق Apple Pay — يُخدَم هنا لأن هذا البناء لا يخدم public/.well-known
  if (request.nextUrl.pathname === '/.well-known/apple-developer-merchantid-domain-association') {
    return new NextResponse(APPLE_PAY_DOMAIN_ASSOCIATION, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Protected routes — require login.
  // تقديم الطلب والدفع يتطلّبان تسجيل الدخول (لتعزيز الثقة وربط الطلب بحساب موثّق).
  const protectedPath =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/request') ||
    pathname.startsWith('/payment')

  if (protectedPath && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    // إعادة العميل إلى وجهته بعد تسجيل الدخول
    url.search = ''
    url.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/request',
    '/request/:path*',
    '/payment/:path*',
    '/.well-known/apple-developer-merchantid-domain-association',
  ],
}
