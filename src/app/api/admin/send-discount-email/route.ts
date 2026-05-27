import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { notifyDiscountCodeToClient } from '@/lib/email'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

export async function POST(request: Request) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { codeId, adminMessage } = await request.json()
  if (!codeId) return NextResponse.json({ error: 'معرّف الكود مطلوب' }, { status: 400 })
  if (!adminMessage?.trim()) return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400 })

  const sc = await createServiceRoleClient()

  // جلب بيانات الكود
  const { data: dc, error: dcErr } = await sc
    .from('discount_codes')
    .select('*')
    .eq('id', codeId)
    .single()

  if (dcErr || !dc) return NextResponse.json({ error: 'الكود غير موجود' }, { status: 404 })
  if (!dc.is_active) return NextResponse.json({ error: 'الكود غير مفعّل' }, { status: 400 })
  if (new Date(dc.expires_at) < new Date()) return NextResponse.json({ error: 'انتهت صلاحية الكود' }, { status: 400 })

  // جلب جميع الطلبات التي لها عروض بانتظار الموافقة
  const { data: quotedRequests } = await sc
    .from('publish_requests')
    .select('id, client_name, client_email')
    .eq('status', 'quoted')
    .not('client_email', 'is', null)

  if (!quotedRequests || quotedRequests.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: 'لا يوجد عملاء بعروض منتظرة حالياً' })
  }

  // إزالة التكرار — بريد واحد لكل عميل (أول طلب له)
  const seen = new Set<string>()
  const targets: { id: string; client_name: string; client_email: string }[] = []
  for (const r of quotedRequests) {
    const email = r.client_email?.toLowerCase()
    if (email && !seen.has(email)) {
      seen.add(email)
      targets.push(r)
    }
  }

  let sent = 0
  let failed = 0

  for (const target of targets) {
    try {
      const ok = await notifyDiscountCodeToClient({
        email:        target.client_email,
        clientName:   target.client_name ?? 'عزيزنا',
        code:         dc.code,
        discountPct:  Number(dc.discount_pct),
        occasion:     dc.occasion ?? null,
        expiresAt:    dc.expires_at,
        adminMessage: adminMessage.trim(),
        requestId:    target.id,
      })
      if (ok) sent++
      else failed++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ sent, failed, total: targets.length })
}

// إحصاء عدد العملاء المؤهلين (للعرض في الـ UI قبل الإرسال)
export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const sc = await createServiceRoleClient()
  const { count } = await sc
    .from('publish_requests')
    .select('client_email', { count: 'exact', head: false })
    .eq('status', 'quoted')
    .not('client_email', 'is', null)

  return NextResponse.json({ count: count ?? 0 })
}
