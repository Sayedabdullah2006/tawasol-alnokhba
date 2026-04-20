import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const { email, password, fullName } = await request.json()

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    // Create user via admin API (bypasses rate limits)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (error) {
      if (error.message.includes('already been registered')) {
        return NextResponse.json({ error: 'هذا البريد مسجل مسبقاً' }, { status: 409 })
      }
      console.error('Register error:', error.message)
      return NextResponse.json({ error: 'حدث خطأ أثناء التسجيل' }, { status: 500 })
    }

    // Update profile
    await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: fullName,
      role: 'client',
    })

    return NextResponse.json({ success: true, userId: data.user.id })
  } catch (err) {
    console.error('Register error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
