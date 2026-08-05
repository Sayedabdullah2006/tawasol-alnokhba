import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { createRadarDraft, publishRadarDraft, scanXRadar } from '@/lib/x-radar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function authorize() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

export async function GET(request: Request) {
  if (!await authorize()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = await createServiceRoleClient()
  const url = new URL(request.url)
  const scanId = url.searchParams.get('scanId')
  const currentScanId = url.searchParams.get('currentScanId')
  if (scanId) {
    const { data, error } = await service.from('x_radar_scan_items')
      .select('*').eq('scan_id', scanId).order('relevance_score', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data ?? [] })
  }
  if (url.searchParams.get('view') === 'history') {
    const { data, error } = await service.from('x_radar_scans')
      .select('id,trigger,window_start,window_end,found,stats,triggered_at')
      .order('triggered_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ scans: data ?? [] })
  }
  const latestScanRequest = service.from('x_radar_scans')
    .select('id,trigger,window_start,window_end,found,stats,triggered_at')
  const { data: latestScan, error: latestScanError } = currentScanId
    ? await latestScanRequest.eq('id', currentScanId).maybeSingle()
    : await latestScanRequest.order('triggered_at', { ascending: false }).limit(1).maybeSingle()
  if (latestScanError) return NextResponse.json({ error: latestScanError.message }, { status: 500 })
  if (!latestScan) return NextResponse.json({ items: [], latestScan: null, automationApproved: process.env.X_AI_REPLY_AUTOMATION_APPROVED === 'true' })
  const { data, error } = await service.from('x_radar_items')
    .select('*')
    .eq('last_seen_scan_id', latestScan.id)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    items: data ?? [],
    latestScan,
    automationApproved: process.env.X_AI_REPLY_AUTOMATION_APPROVED === 'true',
  })
}

export async function POST(request: Request) {
  if (!await authorize()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as { action?: string; id?: string; ids?: string[]; draft?: string; recommendation?: string; status?: string }
  if (body.action === 'scan') {
    try { return NextResponse.json(await scanXRadar('manual')) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed' }, { status: 500 }) }
  }
  const service = await createServiceRoleClient()
  const ids = [...new Set((body.ids ?? []).filter(id => typeof id === 'string'))]
  if (body.action === 'generate_all') {
    const { data: items, error } = await service
      .from('x_radar_items')
      .select('id,post_text,source_type,relevance_score')
      .eq('status', 'pending')
      .order('posted_at', { ascending: false })
      .limit(30)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    let generated = 0
    for (let index = 0; index < (items ?? []).length; index += 3) {
      const batch = (items ?? []).slice(index, index + 3)
      const results = await Promise.allSettled(batch.map(async item => {
        const draft = await createRadarDraft(item)
        const { error: updateError } = await service.from('x_radar_items').update({
          draft_text: draft.draft,
          recommendation: draft.recommendation,
          updated_at: new Date().toISOString(),
        }).eq('id', item.id)
        if (updateError) throw updateError
      }))
      generated += results.filter(result => result.status === 'fulfilled').length
    }
    return NextResponse.json({ generated, inspected: items?.length ?? 0 })
  }
  if (body.action === 'approve_selected') {
    if (!ids.length) return NextResponse.json({ error: 'اختر مسودة واحدة على الأقل' }, { status: 400 })
    const { data: items, error } = await service.from('x_radar_items')
      .select('id,draft_text,recommendation,status').in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const approvable = (items ?? []).filter(item => item.status !== 'published' && item.draft_text?.trim() && ['reply', 'quote'].includes(item.recommendation))
    if (approvable.length) {
      const { error: updateError } = await service.from('x_radar_items')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .in('id', approvable.map(item => item.id))
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    return NextResponse.json({ approved: approvable.length, skipped: ids.length - approvable.length })
  }
  if (body.action === 'publish_selected') {
    if (!ids.length) return NextResponse.json({ error: 'اختر مسودة واحدة على الأقل' }, { status: 400 })
    const { data: items, error } = await service.from('x_radar_items')
      .select('id,x_post_id,draft_text,recommendation,status').in('id', ids).eq('status', 'approved')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    let published = 0
    const failures: string[] = []
    for (const item of items ?? []) {
      try {
        await publishRadarDraft({
          x_post_id: item.x_post_id,
          draft_text: item.draft_text ?? '',
          recommendation: item.recommendation,
        })
        const { error: updateError } = await service.from('x_radar_items')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', item.id)
        if (updateError) throw updateError
        published++
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'تعذر النشر')
      }
    }
    return NextResponse.json({ published, skipped: ids.length - (items?.length ?? 0), failures })
  }
  if (!body.id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 })
  if (body.action === 'generate') {
    const { data: item, error } = await service.from('x_radar_items').select('post_text,source_type,relevance_score').eq('id', body.id).single()
    if (error || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    const generated = await createRadarDraft(item)
    const { data, error: updateError } = await service.from('x_radar_items').update({
      draft_text: generated.draft, recommendation: generated.recommendation, updated_at: new Date().toISOString(),
    }).eq('id', body.id).select().single()
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ item: data })
  }
  if (body.action === 'update') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.draft === 'string') patch.draft_text = body.draft
    if (['reply', 'quote', 'ignore'].includes(String(body.recommendation))) patch.recommendation = body.recommendation
    if (['pending', 'approved', 'ignored'].includes(String(body.status))) patch.status = body.status
    const { data, error } = await service.from('x_radar_items').update(patch).eq('id', body.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  }
  if (body.action === 'publish') {
    const { data: item, error } = await service
      .from('x_radar_items')
      .select('x_post_id,draft_text,recommendation,status')
      .eq('id', body.id)
      .single()
    if (error || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    if (item.status === 'published') return NextResponse.json({ error: 'تم نشر هذه المسودة مسبقاً' }, { status: 409 })
    try {
      const recommendation = ['reply', 'quote'].includes(String(body.recommendation))
        ? String(body.recommendation)
        : item.recommendation
      const result = await publishRadarDraft({
        x_post_id: item.x_post_id,
        draft_text: item.draft_text ?? '',
        recommendation,
      })
      const { data, error: updateError } = await service
        .from('x_radar_items')
        .update({ status: 'published', recommendation, updated_at: new Date().toISOString() })
        .eq('id', body.id)
        .select()
        .single()
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      return NextResponse.json({ item: data, xPostId: result.data?.id ?? null })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر النشر في X' }, { status: 500 })
    }
  }
  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}
