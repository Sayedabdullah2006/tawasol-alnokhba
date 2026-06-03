import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { notifyMotivateUser } from '@/lib/email'

/**
 * تحفيز المستخدمين الذين لم يقدّموا أي طلب لإرسال أول طلب.
 * - بدون userId: يرسل لكل العملاء (غير الإداريين، غير الموقوفين) الذين ليس لديهم طلبات.
 * - مع userId: يرسل لمستخدم واحد محدّد (إن لم يكن لديه طلبات).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const targetUserId: string | undefined = body.userId

    const service = await createServiceRoleClient()

    const { data: authData } = await service.auth.admin.listUsers()
    const authUsers = authData?.users ?? []
    const { data: profiles } = await service.from('profiles').select('id, role, full_name')
    const { data: requests } = await service.from('publish_requests').select('user_id')

    const withRequests = new Set<string>()
    requests?.forEach(r => { if (r.user_id) withRequests.add(r.user_id) })

    const roleById: Record<string, string> = {}
    const nameById: Record<string, string> = {}
    profiles?.forEach(p => { roleById[p.id] = p.role ?? 'client'; nameById[p.id] = p.full_name ?? '' })

    // المرشّحون: عملاء، غير موقوفين، بلا طلبات، ولديهم بريد
    const candidates = authUsers.filter(au => {
      if (targetUserId && au.id !== targetUserId) return false
      if (!au.email || au.email === '-') return false
      if (roleById[au.id] === 'admin') return false
      const banned = au.banned_until ? new Date(au.banned_until) > new Date() : false
      if (banned) return false
      if (withRequests.has(au.id)) return false
      return true
    })

    if (candidates.length === 0) {
      return NextResponse.json({ error: 'لا يوجد مستخدمون مؤهّلون للإرسال' }, { status: 400 })
    }

    let sent = 0
    // إرسال تسلسلي بسيط (الأعداد المتوقعة صغيرة)
    for (const c of candidates) {
      try {
        const ok = await notifyMotivateUser({ email: c.email!, clientName: nameById[c.id] })
        if (ok) sent++
      } catch (e) {
        console.error('[MOTIVATE] send failed for', c.email, e)
      }
    }

    return NextResponse.json({ success: true, sent, total: candidates.length })
  } catch (err) {
    console.error('Motivate users error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
