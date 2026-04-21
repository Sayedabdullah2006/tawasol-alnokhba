import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { MAX_ATTEMPTS } from '@/lib/auth-codes'

export async function POST(request: Request) {
  try {
    const { email, code, newPassword } = await request.json()
    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: 'الحقول الثلاثة مطلوبة' }, { status: 400 })
    }
    if (String(newPassword).length < 6) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedCode = String(code).trim()
    const supabase = await createServiceRoleClient()

    const { data: pending } = await supabase
      .from('auth_codes')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('purpose', 'reset_password')
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!pending) {
      return NextResponse.json({ error: 'لا يوجد طلب إعادة تعيين' }, { status: 404 })
    }

    if (new Date(pending.expires_at) < new Date()) {
      return NextResponse.json({ error: 'انتهت صلاحية الرمز — اطلب رمزاً جديداً' }, { status: 400 })
    }

    if ((pending.attempts ?? 0) >= MAX_ATTEMPTS) {
      await supabase.from('auth_codes').update({ used: true }).eq('id', pending.id)
      return NextResponse.json({ error: 'تجاوزت الحد المسموح — اطلب رمزاً جديداً' }, { status: 400 })
    }

    if (pending.code !== normalizedCode) {
      await supabase
        .from('auth_codes')
        .update({ attempts: (pending.attempts ?? 0) + 1 })
        .eq('id', pending.id)
      return NextResponse.json({ error: 'الرمز غير صحيح' }, { status: 400 })
    }

    // Find the user and update their password
    const { data: users } = await supabase.auth.admin.listUsers()
    const target = users?.users?.find(u => u.email?.toLowerCase() === normalizedEmail)
    if (!target) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    }

    const { error: updErr } = await supabase.auth.admin.updateUserById(target.id, {
      password: newPassword,
    })
    if (updErr) {
      console.error('Reset password update error:', updErr)
      return NextResponse.json({ error: 'تعذّر تحديث كلمة المرور' }, { status: 500 })
    }

    await supabase.from('auth_codes').update({ used: true }).eq('id', pending.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Reset-verify error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
