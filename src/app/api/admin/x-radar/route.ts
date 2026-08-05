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

export async function GET() {
  if (!await authorize()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = await createServiceRoleClient()
  const { data, error } = await service.from('x_radar_items')
    .select('*').order('posted_at', { ascending: false, nullsFirst: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    items: data ?? [],
    automationApproved: process.env.X_AI_REPLY_AUTOMATION_APPROVED === 'true',
  })
}

export async function POST(request: Request) {
  if (!await authorize()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as { action?: string; id?: string; draft?: string; recommendation?: string; status?: string }
  if (body.action === 'scan') {
    try { return NextResponse.json(await scanXRadar()) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed' }, { status: 500 }) }
  }
  if (!body.id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 })
  const service = await createServiceRoleClient()
  if (body.action === 'generate') {
    const { data: item, error } = await service.from('x_radar_items').select('post_text,source_type').eq('id', body.id).single()
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
      const result = await publishRadarDraft({
        x_post_id: item.x_post_id,
        draft_text: item.draft_text ?? '',
        recommendation: item.recommendation,
      })
      const { data, error: updateError } = await service
        .from('x_radar_items')
        .update({ status: 'published', updated_at: new Date().toISOString() })
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
