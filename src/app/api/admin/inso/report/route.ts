import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { listAccounts } from '@/lib/postpulse'
import { createInsoCampaignReport, type InsoReportChannel } from '@/lib/inso-campaign-report'
import { INSO_CAMPAIGN_KEY, type InsoCoverageItem } from '@/lib/inso-2026'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PLATFORM_LABELS: Record<string, string> = {
  X_TWITTER: 'X', X: 'X', INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn', FACEBOOK: 'Facebook', TIKTOK: 'TikTok',
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  try {
    const service = await createServiceRoleClient()
    const [{ data: items, error }, { data: brand }] = await Promise.all([
      service.from('event_coverage_items').select('*').eq('campaign_key', INSO_CAMPAIGN_KEY).order('coverage_date', { ascending: true }).order('created_at', { ascending: true }),
      service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single(),
    ])
    if (error) throw error
    let channels: InsoReportChannel[] = []
    try {
      const accounts = await listAccounts()
      if (Array.isArray(accounts)) channels = accounts
        .map(account => account && typeof account === 'object' ? account as Record<string, unknown> : null)
        .filter((account): account is Record<string, unknown> => Boolean(account))
        .map(account => ({ platform: String(account.platform ?? ''), label: PLATFORM_LABELS[String(account.platform ?? '').toUpperCase()] ?? String(account.platform ?? 'قناة متصلة') }))
    } catch { /* التقرير يعرض مؤشرات التنفيذ حتى عند عدم توفر قراءة القنوات. */ }

    const pdf = await createInsoCampaignReport({
      items: (items ?? []) as InsoCoverageItem[], logoUrl: brand?.first1saudi_logo_url ?? null, channels,
    })
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="inso-2026-campaign-report.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر إنشاء التقرير' }, { status: 500 })
  }
}
