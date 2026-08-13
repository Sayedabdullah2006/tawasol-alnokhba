import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { finishMembershipActivation } from '@/lib/membership-payment'
import { extractApprovedMagazineItems } from '@/lib/member-magazine'

async function requireAdmin() {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const service = await createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return profile?.role === 'admin' ? { user, service } : null
}

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const now = new Date().toISOString()
  await ctx.service
    .from('memberships')
    .update({ status: 'expired', updated_at: now })
    .in('status', ['active', 'paused'])
    .lte('ends_at', now)

  const { data, error } = await ctx.service.from('memberships').select('*, membership_plans(*), membership_plan_prices(*)').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'تعذر تحميل العضويات' }, { status: 500 })
  const ids = (data ?? []).map(item => item.id)
  const [{ data: wallets }, { data: benefitWallets }, { data: deliverables }, { data: memberRequests }, { data: magazines }] = ids.length > 0
    ? await Promise.all([
        ctx.service.from('membership_credit_wallets').select('*').in('membership_id', ids),
        ctx.service.from('membership_benefit_wallets').select('*').in('membership_id', ids).order('benefit_type'),
        ctx.service.from('membership_deliverables').select('*').in('membership_id', ids).order('due_at'),
        ctx.service.from('publish_requests').select('id, membership_id, request_number, title, category, content, status, campaign_posts, post_reviews, content_approved_at, updated_at, created_at').in('membership_id', ids).order('created_at', { ascending: false }),
        ctx.service.from('membership_magazines').select('membership_id, share_token, is_public').in('membership_id', ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]
  return NextResponse.json({
    memberships: (data ?? []).map(item => ({
      ...item,
      wallet: wallets?.find(wallet => wallet.membership_id === item.id) ?? null,
      benefitWallets: benefitWallets?.filter(wallet => wallet.membership_id === item.id) ?? [],
      deliverables: deliverables?.filter(deliverable => deliverable.membership_id === item.id) ?? [],
      recentRequests: memberRequests?.filter(request => request.membership_id === item.id).slice(0, 5) ?? [],
      approvedDesigns: extractApprovedMagazineItems((memberRequests?.filter(request => request.membership_id === item.id) ?? []) as Array<Record<string, unknown>>).slice(0, 5),
      magazine: magazines?.find(magazine => magazine.membership_id === item.id) ?? null,
    })),
  })
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const { membershipId, action, deliverableId, fileUrl, notes } = await request.json().catch(() => ({}))
  if (!membershipId || !action) return NextResponse.json({ error: 'البيانات غير مكتملة' }, { status: 400 })

  if (action === 'activate_bank') {
    const { data: activated, error } = await ctx.service.rpc('activate_membership', { p_membership_id: membershipId, p_provider: 'bank_transfer', p_provider_payment_id: `bank:${membershipId}`, p_provider_response: { confirmed_by: ctx.user.id, confirmed_at: new Date().toISOString() } })
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    const membership = Array.isArray(activated) ? activated[0] : activated
    if (membership) void finishMembershipActivation(membership)
    return NextResponse.json({ success: true })
  }
  if (action === 'pause' || action === 'resume') {
    const status = action === 'pause' ? 'paused' : 'active'
    const { error } = await ctx.service.from('memberships').update({ status, updated_at: new Date().toISOString() }).eq('id', membershipId).in('status', action === 'pause' ? ['active'] : ['paused'])
    if (error) return NextResponse.json({ error: 'تعذر تحديث العضوية' }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  if (action === 'start_deliverable' || action === 'complete_deliverable') {
    if (!deliverableId) return NextResponse.json({ error: 'المخرج المطلوب غير محدد' }, { status: 400 })
    const status = action === 'complete_deliverable' ? 'completed' : 'in_progress'
    const { error } = await ctx.service.from('membership_deliverables').update({
      status,
      notes: typeof notes === 'string' ? (notes.trim() || null) : undefined,
      file_url: typeof fileUrl === 'string' ? (fileUrl.trim() || null) : undefined,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', deliverableId).eq('membership_id', membershipId)
    if (error) return NextResponse.json({ error: 'تعذر تحديث مخرج العضوية' }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'إجراء غير مدعوم' }, { status: 400 })
}
