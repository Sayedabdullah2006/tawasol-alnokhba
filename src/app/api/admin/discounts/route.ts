import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const sc = await createServiceRoleClient()
  const { data, error } = await sc.from('discount_codes').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'فشل جلب البيانات' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const body = await request.json()
  const { code, occasion, discount_pct, expires_at, max_uses } = body

  if (!code?.trim()) return NextResponse.json({ error: 'اسم الكود مطلوب' }, { status: 400 })
  if (!discount_pct || Number(discount_pct) <= 0 || Number(discount_pct) > 100) {
    return NextResponse.json({ error: 'نسبة الخصم يجب أن تكون بين 1 و 100' }, { status: 400 })
  }
  if (!expires_at) return NextResponse.json({ error: 'تاريخ الانتهاء مطلوب' }, { status: 400 })

  const sc = await createServiceRoleClient()
  const { data, error } = await sc
    .from('discount_codes')
    .insert({
      code: code.trim().toUpperCase(),
      occasion: occasion?.trim() || null,
      discount_pct: Number(discount_pct),
      expires_at: new Date(expires_at).toISOString(),
      max_uses: max_uses ? Number(max_uses) : null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'هذا الكود موجود مسبقاً' }, { status: 400 })
    return NextResponse.json({ error: 'فشل إنشاء الكود' }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function PATCH(request: Request) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const { id, is_active, expires_at, max_uses } = await request.json()
  if (!id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })

  const updates: Record<string, boolean | string | number | null> = {}
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (expires_at !== undefined) {
    const expiry = new Date(expires_at)
    if (Number.isNaN(expiry.getTime())) {
      return NextResponse.json({ error: 'تاريخ الانتهاء غير صالح' }, { status: 400 })
    }
    if (expiry.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'يجب أن يكون تاريخ الانتهاء الجديد في المستقبل' }, { status: 400 })
    }
    updates.expires_at = expiry.toISOString()
  }
  if (max_uses !== undefined) {
    if (max_uses !== null && (!Number.isInteger(Number(max_uses)) || Number(max_uses) < 1)) {
      return NextResponse.json({ error: 'حد الاستخدام غير صالح' }, { status: 400 })
    }
    updates.max_uses = max_uses === null ? null : Number(max_uses)
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'لا توجد تعديلات للحفظ' }, { status: 400 })
  }

  const sc = await createServiceRoleClient()
  const { data: current, error: currentError } = await sc
    .from('discount_codes')
    .select('used_count')
    .eq('id', id)
    .maybeSingle()
  if (currentError) return NextResponse.json({ error: 'فشل التحقق من الكود' }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'الكود غير موجود' }, { status: 404 })
  if (typeof updates.max_uses === 'number' && updates.max_uses <= current.used_count) {
    return NextResponse.json({ error: `يجب أن يكون حد الاستخدام أكبر من مرات الاستخدام الحالية (${current.used_count})` }, { status: 400 })
  }

  const { data, error } = await sc
    .from('discount_codes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(request: Request) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })

  const sc = await createServiceRoleClient()
  const { error } = await sc.from('discount_codes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'فشل الحذف' }, { status: 500 })
  return NextResponse.json({ success: true })
}
