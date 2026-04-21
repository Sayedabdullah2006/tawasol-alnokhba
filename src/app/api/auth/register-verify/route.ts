import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { MAX_ATTEMPTS } from '@/lib/auth-codes'

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()
    if (!email || !code) {
      return NextResponse.json({ error: 'البريد والرمز مطلوبان' }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedCode = String(code).trim()
    const supabase = await createServiceRoleClient()

    const { data: pending } = await supabase
      .from('auth_codes')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('purpose', 'register')
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!pending) {
      return NextResponse.json({ error: 'لا يوجد طلب تسجيل قيد الانتظار' }, { status: 404 })
    }

    if (new Date(pending.expires_at) < new Date()) {
      return NextResponse.json({ error: 'انتهت صلاحية الرمز — أعد التسجيل' }, { status: 400 })
    }

    if ((pending.attempts ?? 0) >= MAX_ATTEMPTS) {
      await supabase.from('auth_codes').update({ used: true }).eq('id', pending.id)
      return NextResponse.json({ error: 'تجاوزت الحد المسموح من المحاولات — أعد التسجيل' }, { status: 400 })
    }

    if (pending.code !== normalizedCode) {
      await supabase
        .from('auth_codes')
        .update({ attempts: (pending.attempts ?? 0) + 1 })
        .eq('id', pending.id)
      return NextResponse.json({ error: 'الرمز غير صحيح' }, { status: 400 })
    }

    // Code OK — create the auth user with the pending credentials
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: pending.email,
      password: pending.password,
      email_confirm: true,
      user_metadata: { full_name: pending.full_name },
    })

    if (createErr || !created?.user) {
      if (createErr?.message.toLowerCase().includes('already been registered')) {
        return NextResponse.json({ error: 'هذا البريد مسجل مسبقاً' }, { status: 409 })
      }
      console.error('Create user error:', createErr)
      return NextResponse.json({ error: 'تعذّر إنشاء الحساب' }, { status: 500 })
    }

    await supabase.from('profiles').upsert({
      id: created.user.id,
      full_name: pending.full_name,
      role: 'client',
    })

    // Mark code as used + clear sensitive payload
    await supabase
      .from('auth_codes')
      .update({ used: true, password: null })
      .eq('id', pending.id)

    return NextResponse.json({ success: true, email: pending.email })
  } catch (err) {
    console.error('Register-verify error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
