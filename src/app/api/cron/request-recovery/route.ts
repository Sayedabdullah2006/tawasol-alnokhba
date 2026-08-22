import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createEmailResumeToken, makeRecoveryCode } from '@/lib/request-recovery'
import {
  notifyRequestRecoveryFirst,
  notifyRequestRecoverySecond,
  notifyRequestRecoveryOffer,
} from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'

type Draft = {
  id: string
  client_email: string
  client_name: string | null
  selected_package: string
  estimated_total: number | null
  first_reminder_sent_at: string | null
  second_reminder_sent_at: string | null
  offer_sent_at: string | null
  offer_code: string | null
  offer_expires_at: string | null
  last_activity_at: string
}

const hoursAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000

export async function POST(request: Request) {
  const key = request.headers.get('x-api-key')
    || new URL(request.url).searchParams.get('key')
    || request.headers.get('authorization')?.replace('Bearer ', '')
  if (key !== CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = await createServiceRoleClient()
  const cutoff = new Date(Date.now() - 3 * 3_600_000).toISOString()
  const { data, error } = await service
    .from('request_recovery_drafts')
    .select('id, client_email, client_name, selected_package, estimated_total, first_reminder_sent_at, second_reminder_sent_at, offer_sent_at, offer_code, offer_expires_at, last_activity_at')
    .eq('status', 'active')
    .lte('last_activity_at', cutoff)
    .order('last_activity_at', { ascending: true })
    .limit(40)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const summary = { checked: data?.length ?? 0, first: 0, second: 0, offers: 0, closed: 0, failed: 0 }
  for (const draft of (data ?? []) as Draft[]) {
    try {
      const age = hoursAgo(draft.last_activity_at)
      if (age >= 168) {
        await service.from('request_recovery_drafts').update({
          status: 'expired',
          updated_at: new Date().toISOString(),
        }).eq('id', draft.id)
        await service.from('discount_codes').update({ is_active: false }).eq('recovery_draft_id', draft.id)
        summary.closed++
        continue
      }

      const { data: existingRequest } = await service
        .from('publish_requests')
        .select('id')
        .ilike('client_email', draft.client_email)
        .gte('created_at', draft.last_activity_at)
        .limit(1)
        .maybeSingle()
      if (existingRequest) {
        await service.from('request_recovery_drafts').update({
          status: 'recovered',
          recovered_request_id: existingRequest.id,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', draft.id)
        summary.closed++
        continue
      }

      const resumeUrl = `${process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://nukhba.media'}/request?resume=${encodeURIComponent(createEmailResumeToken(draft.id))}`
      const common = {
        email: draft.client_email,
        clientName: draft.client_name || 'عزيزنا',
        packageId: draft.selected_package,
        estimatedTotal: draft.estimated_total,
        resumeUrl,
      }

      if (!draft.first_reminder_sent_at) {
        const sent = await notifyRequestRecoveryFirst(common)
        if (sent) {
          await service.from('request_recovery_drafts').update({ first_reminder_sent_at: new Date().toISOString() }).eq('id', draft.id)
          summary.first++
        } else summary.failed++
        continue
      }

      if (age >= 24 && !draft.second_reminder_sent_at) {
        const sent = await notifyRequestRecoverySecond(common)
        if (sent) {
          await service.from('request_recovery_drafts').update({ second_reminder_sent_at: new Date().toISOString() }).eq('id', draft.id)
          summary.second++
        } else summary.failed++
        continue
      }

      if (age < 48 || draft.offer_sent_at) continue

      const { count: priorOrders } = await service
        .from('publish_requests')
        .select('id', { count: 'exact', head: true })
        .ilike('client_email', draft.client_email)
        .not('status', 'in', '(cancelled,rejected,auto_closed)')

      if ((priorOrders ?? 0) > 0) {
        await service.from('request_recovery_drafts').update({ offer_sent_at: new Date().toISOString() }).eq('id', draft.id)
        continue
      }

      let code = draft.offer_code
      let expiresAt = draft.offer_expires_at
      if (!code || !expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
        code = makeRecoveryCode()
        expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString()
        const { data: existingDiscount } = await service
          .from('discount_codes')
          .select('id')
          .eq('recovery_draft_id', draft.id)
          .maybeSingle()
        const discountValues = {
          code,
          occasion: 'عرض استكمال الطلب',
          discount_pct: 5,
          max_discount_amount: 150,
          expires_at: expiresAt,
          max_uses: 1,
          used_count: 0,
          is_active: true,
          recovery_draft_id: draft.id,
        }
        const discountResult = existingDiscount
          ? await service.from('discount_codes').update(discountValues).eq('id', existingDiscount.id)
          : await service.from('discount_codes').insert(discountValues)
        if (discountResult.error) throw discountResult.error
      }

      await service.from('request_recovery_drafts').update({
        offer_code: code,
        offer_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }).eq('id', draft.id)

      const sent = await notifyRequestRecoveryOffer({ ...common, code, expiresAt })
      if (sent) {
        await service.from('request_recovery_drafts').update({ offer_sent_at: new Date().toISOString() }).eq('id', draft.id)
        summary.offers++
      } else summary.failed++
    } catch (draftError) {
      console.error('[REQUEST RECOVERY] Draft processing failed:', draft.id, draftError)
      summary.failed++
    }
  }
  return NextResponse.json(summary)
}

export async function GET(request: Request) {
  return POST(request)
}
