/**
 * Incentivize Users API Route
 * Targets registered users who have NEVER placed a request, creates (or refreshes)
 * a shared welcome discount code at the chosen percentage, then bulk-emails them
 * an Arabic, RTL invitation to place their first order using that code.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { sendEmailWithRetry } from '@/lib/email-queue'
import { welcomeIncentiveToClient } from '@/lib/email-templates'

// Throttle between sends — stays below Resend free-tier limits (≈1.6 sends/sec).
const SEND_DELAY_MS = 600
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Bulk batches can be slow; allow a longer run.
export const maxDuration = 300

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

/** Returns { email, full_name } for every non-admin user with zero requests. */
async function getUsersWithoutOrders(sc: Awaited<ReturnType<typeof createServiceRoleClient>>) {
  const { data: authData } = await sc.auth.admin.listUsers()
  const authUsers = authData?.users ?? []

  const { data: profiles } = await sc.from('profiles').select('id, full_name, role')
  const { data: requests } = await sc.from('publish_requests').select('user_id')

  const hasOrder = new Set<string>()
  requests?.forEach(r => { if (r.user_id) hasOrder.add(r.user_id) })

  const profileById = new Map((profiles ?? []).map(p => [p.id, p]))

  return authUsers
    .filter(au => {
      const prof = profileById.get(au.id)
      if (prof?.role === 'admin') return false
      if (hasOrder.has(au.id)) return false
      return Boolean(au.email)
    })
    .map(au => ({
      email: au.email as string,
      fullName: profileById.get(au.id)?.full_name || 'عزيزنا',
    }))
}

// عدد المستخدمين المؤهلين (للعرض في الواجهة قبل الإرسال)
export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const sc = await createServiceRoleClient()
  const targets = await getUsersWithoutOrders(sc)
  return NextResponse.json({ count: targets.length })
}

export async function POST(request: Request) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json()
  const discountPct = Number(body.discountPct)
  const message: string = (body.message ?? '').toString().trim()
  const expiryDays = Number(body.expiryDays) > 0 ? Number(body.expiryDays) : 14
  const rawCode: string = (body.code ?? '').toString().trim()

  if (!discountPct || discountPct <= 0 || discountPct > 100) {
    return NextResponse.json({ error: 'نسبة الخصم يجب أن تكون بين 1 و 100' }, { status: 400 })
  }
  if (!message) {
    return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400 })
  }

  const code = (rawCode || `WELCOME${Math.round(discountPct)}`).toUpperCase()
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()

  const sc = await createServiceRoleClient()

  // إنشاء الكود أو تحديثه إن كان موجوداً (نسبة جديدة + تفعيل + تمديد الصلاحية)
  const { data: existing } = await sc
    .from('discount_codes')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  if (existing) {
    const { error: updErr } = await sc
      .from('discount_codes')
      .update({
        discount_pct: discountPct,
        occasion: 'ترحيب — أول طلب',
        expires_at: expiresAt,
        is_active: true,
      })
      .eq('id', existing.id)
    if (updErr) return NextResponse.json({ error: 'فشل تحديث كود الخصم' }, { status: 500 })
  } else {
    const { error: insErr } = await sc
      .from('discount_codes')
      .insert({
        code,
        occasion: 'ترحيب — أول طلب',
        discount_pct: discountPct,
        expires_at: expiresAt,
        max_uses: null,
      })
    if (insErr) return NextResponse.json({ error: 'فشل إنشاء كود الخصم' }, { status: 500 })
  }

  // جلب المستخدمين الذين لم يقدّموا أي طلب
  const targets = await getUsersWithoutOrders(sc)
  if (targets.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, total: 0, code, message: 'لا يوجد مستخدمون بدون طلبات حالياً' })
  }

  let sent = 0
  let failed = 0

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    const tpl = welcomeIncentiveToClient({
      clientName: t.fullName,
      code,
      discountPct,
      expiresAt,
      adminMessage: message,
    })

    const result = await sendEmailWithRetry({
      to: t.email,
      subject: tpl.subject,
      html: tpl.html,
      context: `incentivize-${code}`,
      retries: 3,
      enhanced: false,
      category: 'notification',
    })

    if (result.success) sent++
    else failed++

    if (i < targets.length - 1) await sleep(SEND_DELAY_MS)
  }

  console.log(`[INCENTIVIZE] code=${code} pct=${discountPct} sent=${sent} failed=${failed} total=${targets.length}`)
  return NextResponse.json({ success: true, code, total: targets.length, sent, failed })
}
