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
  const { id, is_active } = await request.json()
  if (!id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })

  const sc = await createServiceRoleClient()
  const { error } = await sc.from('discount_codes').update({ is_active }).eq('id', id)
  if (error) return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 })
  return NextResponse.json({ success: true })
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
