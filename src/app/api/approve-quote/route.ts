import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { calculateReach, EXTRAS_REACH_BOOST } from '@/lib/pricing-engine'

interface OfferedExtra {
  id: string
  name: string
  price: number
  reachBoost: number
}

// Resolve the catalog of valid extras for a request:
//   1. If admin offered extras → use those (admin-controlled list).
//   2. Else → fall back to all active extras from the DB, priced from the
//      influencer's pricing_config or the default price.
async function resolveAvailableExtras(
  serviceClient: any,
  request: any
): Promise<Map<string, OfferedExtra>> {
  const offered = (request.admin_offered_extras ?? []) as OfferedExtra[]
  if (offered.length > 0) return new Map(offered.map(e => [e.id, e]))

  const { data: dbExtras } = await serviceClient
    .from('extras').select('*').eq('is_active', true)

  let extrasPrices: Record<string, number> = {}
  if (request.influencer_id) {
    const { data: pc } = await serviceClient
      .from('pricing_config').select('extras_prices').eq('influencer_id', request.influencer_id).single()
    extrasPrices = pc?.extras_prices ?? {}
  }

  const map = new Map<string, OfferedExtra>()
  for (const e of dbExtras ?? []) {
    if (e.category_only && e.category_only !== request.category) continue
    map.set(e.id, {
      id: e.id,
      name: e.name_ar,
      price: extrasPrices[e.id] ?? Number(e.default_price ?? 0),
      reachBoost: EXTRAS_REACH_BOOST[e.id] ?? 0,
    })
  }
  return map
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

    const body = await request.json()
    const { requestId, selectedExtras } = body as {
      requestId: string
      selectedExtras: string[]
    }

    const { data: req, error: loadErr } = await supabase
      .from('publish_requests')
      .select('*, influencers(*)')
      .eq('id', requestId)
      .single()

    if (loadErr || !req) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (req.user_id !== user.id) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    if (req.status !== 'quoted' && req.status !== 'approved') {
      return NextResponse.json({ error: 'لا يمكن تعديل هذا الطلب' }, { status: 400 })
    }

    // Service role for both reads (extras/pricing_config require it under admin RLS)
    // and the publish_requests update (users have no UPDATE policy).
    const serviceClient = await createServiceRoleClient()
    const availableMap = await resolveAvailableExtras(serviceClient, req)

    const valid = (selectedExtras ?? []).filter(id => availableMap.has(id))
    const extrasSelected = valid.map(id => availableMap.get(id)!)
    const extrasTotal = extrasSelected.reduce((sum, e) => sum + (e.price ?? 0), 0)
    const finalTotal = Number(req.admin_quoted_price ?? 0) + extrasTotal

    const reach = calculateReach({
      influencer: req.influencers ?? {},
      scope: req.scope === 'all' ? 'all' : 'single',
      extras: valid,
    })

    const baseReach = reach > 0 ? reach : Math.round(
      (req.estimated_reach ?? 0) * (1 + valid.reduce((s, id) => s + (EXTRAS_REACH_BOOST[id] ?? 0), 0))
    )

    // Persist the resolved offered list too — locks the prices once the user starts selecting,
    // so subsequent reads of the request show what was charged.
    const persistedOffered = req.admin_offered_extras?.length
      ? req.admin_offered_extras
      : Array.from(availableMap.values())

    const { error: updErr } = await serviceClient
      .from('publish_requests')
      .update({
        admin_offered_extras: persistedOffered,
        user_selected_extras: valid,
        extras_selected_total: extrasTotal,
        final_total: finalTotal,
        estimated_reach: baseReach,
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (updErr) {
      console.error('Approve update error:', updErr)
      return NextResponse.json({ error: 'فشل اعتماد التسعيرة' }, { status: 500 })
    }

    return NextResponse.json({ success: true, redirectTo: `/payment/${requestId}` })
  } catch (err) {
    console.error('Approve quote error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
