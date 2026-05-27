import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const { code } = await request.json()
    if (!code?.trim()) {
      return NextResponse.json({ valid: false, error: 'أدخل الكود' })
    }

    const serviceClient = await createServiceRoleClient()
    const { data: dc } = await serviceClient
      .from('discount_codes')
      .select('id, code, occasion, discount_pct, expires_at, max_uses, used_count, is_active')
      .eq('code', code.trim().toUpperCase())
      .single()

    if (!dc) return NextResponse.json({ valid: false, error: 'الكود غير صحيح' })
    if (!dc.is_active) return NextResponse.json({ valid: false, error: 'الكود غير مفعّل' })
    if (new Date(dc.expires_at) < new Date()) return NextResponse.json({ valid: false, error: 'انتهت صلاحية الكود' })
    if (dc.max_uses !== null && dc.used_count >= dc.max_uses) {
      return NextResponse.json({ valid: false, error: 'تم استنفاد استخدامات الكود' })
    }

    return NextResponse.json({
      valid: true,
      id: dc.id,
      code: dc.code,
      discount_pct: Number(dc.discount_pct),
      occasion: dc.occasion ?? null,
    })
  } catch {
    return NextResponse.json({ valid: false, error: 'حدث خطأ' }, { status: 500 })
  }
}
