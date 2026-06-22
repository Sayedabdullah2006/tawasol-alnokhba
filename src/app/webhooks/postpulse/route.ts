/**
 * مستقبِل إشعارات Post-Pulse (تسليم المنشورات): https://nukhba.media/webhooks/postpulse
 * يتحقّق من السرّ (POSTPULSE_WEBHOOK_SECRET) بأكثر من صيغة شائعة، ثم يحدّث حالة
 * المنشور المطابق لـ data.scheduleId. يعيد 200 دائماً لمنع إعادة المحاولة اللانهائية.
 */
import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

function verify(req: Request, rawBody: string): boolean {
  const secret = process.env.POSTPULSE_WEBHOOK_SECRET
  if (!secret) return true // لم يُضبط بعد — نقبل مؤقتاً (يُنصح بضبطه)

  const h = req.headers
  // 1) سرّ مباشر في ترويسة أو bearer
  const direct =
    h.get('x-webhook-secret') ||
    h.get('x-postpulse-secret') ||
    h.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    new URL(req.url).searchParams.get('secret')
  if (direct && safeEq(direct, secret)) return true

  // 2) توقيع HMAC-SHA256 hex للجسم
  const sig = h.get('x-postpulse-signature') || h.get('x-signature') || h.get('x-hub-signature-256')
  if (sig) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const provided = sig.replace(/^sha256=/i, '')
    if (safeEq(provided, expected)) return true
  }
  return false
}

export async function POST(req: Request) {
  const rawBody = await req.text().catch(() => '')

  if (!verify(req, rawBody)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let event: { type?: string; data?: { scheduleId?: number | string; status?: string; platform?: string } } = {}
  try { event = rawBody ? JSON.parse(rawBody) : {} } catch { /* تجاهل */ }

  try {
    const scheduleId = event.data?.scheduleId
    if (scheduleId != null) {
      const sc = await createServiceRoleClient()
      const status = (event.data?.status || event.type || 'updated').toString().toLowerCase()
      await sc
        .from('postpulse_posts')
        .update({ status, event_raw: event as object, updated_at: new Date().toISOString() })
        .eq('schedule_id', String(scheduleId))
    }
  } catch { /* تجاهل أخطاء التحديث */ }

  return NextResponse.json({ received: true })
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'postpulse-webhook' })
}
