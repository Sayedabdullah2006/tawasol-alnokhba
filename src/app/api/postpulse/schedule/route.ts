/**
 * جدولة منشور في موعد محدّد (بتوقيت السعودية) لكل القنوات عبر Post-Pulse.
 * أدمن فقط. body: { content, imageUrl?, mediaType?: 'video', scheduledLocal: "YYYY-MM-DDTHH:mm", accountIds?, socialScheduleId? }
 * scheduledLocal يُفسَّر كتوقيت السعودية (UTC+3).
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { listScheduledPosts, uploadMediaFromUrl, publishNow } from '@/lib/postpulse'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { content?: string; imageUrl?: string; mediaType?: 'video'; scheduledLocal?: string; accountIds?: number[]; requestId?: string; notifyClient?: boolean; socialScheduleId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const content = (body.content ?? '').trim()
  const imageUrl = (body.imageUrl ?? '').trim()
  const local = (body.scheduledLocal ?? '').trim()
  if (!content && !imageUrl) return NextResponse.json({ error: 'النص أو التصميم مطلوب' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    return NextResponse.json({ error: 'حدّد تاريخ ووقت الجدولة' }, { status: 400 })
  }

  // تفسير الوقت كتوقيت السعودية (UTC+3) → ISO بتوقيت UTC
  const scheduledTime = new Date(`${local}:00+03:00`)
  if (isNaN(scheduledTime.getTime())) return NextResponse.json({ error: 'تاريخ غير صالح' }, { status: 400 })
  if (scheduledTime.getTime() < Date.now() + 60 * 1000) {
    return NextResponse.json({ error: 'اختر وقتاً مستقبلياً (بعد الآن بدقيقة على الأقل)' }, { status: 400 })
  }

  // لا نسمح بتزاحم الجدولة اليدوية: ساعة كاملة على الأقل بين أي منشورين.
  const isActive = (status: unknown) => !['failed', 'cancelled', 'canceled', 'draft', 'media_import_failed'].includes(String(status ?? '').toLowerCase())
  try {
    const service = await createServiceRoleClient()
    const { data: localPosts } = await service
      .from('postpulse_posts')
      .select('scheduled_for,status')
      .gte('scheduled_for', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    const times = (localPosts ?? [])
      .filter(post => isActive(post.status) && post.scheduled_for)
      .map(post => new Date(String(post.scheduled_for)).getTime())
    try {
      const remote = await listScheduledPosts()
      times.push(...remote.filter(post => isActive(post.status)).map(post => new Date(post.when).getTime()))
    } catch { /* سجلنا المحلي يبقى مرجعاً احتياطياً */ }
    if (times.some(time => Number.isFinite(time) && Math.abs(time - scheduledTime.getTime()) < 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'اختر وقتاً يبعد ساعة كاملة على الأقل عن أي منشور مجدول.' }, { status: 409 })
    }
  } catch { /* لا نمنع الجدولة عند تعذّر قراءة التقويم، وPostPulse سيبقى المرجع النهائي */ }

  try {
    const attachmentPaths: string[] = []
    if (imageUrl) {
      const media = await uploadMediaFromUrl(imageUrl)
      if (media.path) attachmentPaths.push(media.path)
    }
    const { accountIds, scheduleId, result } = await publishNow({
      content: content || ' ',
      attachmentPaths,
      accountIds: Array.isArray(body.accountIds) && body.accountIds.length ? body.accountIds : undefined,
      scheduledTime: scheduledTime.toISOString(),
      mediaType: body.mediaType === 'video' ? 'video' : undefined,
    })

    // تسجيل المنشور المجدول للتتبّع
    try {
      const sc = await createServiceRoleClient()
      await sc.from('postpulse_posts').insert({
        schedule_id: scheduleId,
        content,
        design_url: imageUrl || null,
        accounts: accountIds,
        status: 'scheduled',
        scheduled_for: scheduledTime.toISOString(),
        event_raw: result as object,
      })
    } catch { /* تجاهل */ }

    if (body.socialScheduleId) {
      try {
        const sc = await createServiceRoleClient()
        await sc
          .from('social_schedule')
          .update({ status: 'scheduled' })
          .eq('id', body.socialScheduleId)
      } catch { /* تجاهل */ }
    }

    // عند جدولة محتوى طلب معتمد: الحالة «مجدول للنشر» + إشعار العميل بموعد النشر
    if (body.requestId) {
      try {
        const sc = await createServiceRoleClient()
        const { data: reqRow } = await sc
          .from('publish_requests')
          .select('client_email, client_name, request_number')
          .eq('id', body.requestId)
          .single()
        await sc.from('publish_requests').update({ status: 'scheduled', updated_at: new Date().toISOString() }).eq('id', body.requestId)
        if (body.notifyClient && reqRow?.client_email) {
          const whenAr = new Intl.DateTimeFormat('ar', {
            timeZone: 'Asia/Riyadh', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true, calendar: 'gregory',
          }).format(scheduledTime)
          const reqNo = `ATH-${String(reqRow.request_number).padStart(4, '0')}`
          await sendEmail(
            reqRow.client_email as string,
            `🗓️ تم تحديد موعد نشر طلبك ${reqNo}`,
            clientScheduleEmail(reqNo, (reqRow.client_name as string) || 'عزيزنا العميل', whenAr, imageUrl),
          ).catch(() => {})
        }
      } catch { /* تجاهل أخطاء التحديث/الإشعار */ }
    }

    return NextResponse.json({ ok: true, accountIds, scheduledTime: scheduledTime.toISOString() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل الجدولة' }, { status: 502 })
  }
}

// إيميل إشعار العميل بموعد نشر محتواه المعتمد.
function clientScheduleEmail(reqNo: string, clientName: string, whenAr: string, imageUrl: string): string {
  const design = imageUrl
    ? `<div style="text-align:center;margin:16px 0"><img src="${imageUrl}" alt="التصميم" style="max-width:220px;border-radius:12px;border:1px solid #e2e8f0" /></div>`
    : ''
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f1f5f9;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;text-align:center">
      <h2 style="color:#0A2D35;margin:0 0 6px">🗓️ تم تحديد موعد نشر طلبك</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 12px">مرحباً ${clientName}، تمّت جدولة نشر محتوى طلبك <strong>${reqNo}</strong> على قنواتنا في الموعد التالي:</p>
      <div style="background:#e8f5e8;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:12px 0">
        <div style="color:#166534;font-size:16px;font-weight:bold">${whenAr}</div>
        <div style="color:#166534;font-size:12px;margin-top:4px">(بتوقيت السعودية)</div>
      </div>
      ${design}
      <p style="color:#94a3b8;font-size:12px;margin-top:16px">سيُنشر المحتوى تلقائياً في الموعد المحدّد. شكراً لثقتك.</p>
    </div></body></html>`
}
