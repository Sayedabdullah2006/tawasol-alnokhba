import { createServiceRoleClient } from '@/lib/supabase-server'
import { EXTRAS_REACH_BOOST } from '@/lib/pricing-engine'

interface OfferedExtra {
  id: string
  name: string
  price: number
  reachBoost: number
}

type ServiceClient = Awaited<ReturnType<typeof createServiceRoleClient>>
type ExtrasRequest = {
  admin_offered_extras?: OfferedExtra[] | null
  influencer_id?: string | null
  category?: string | null
}
// Resolve the catalog of valid extras for a request:
//   1. If admin offered extras → use those (admin-controlled list).
//   2. Else → fall back to all active extras from the DB, priced from the
//      influencer's pricing_config or the default price.
export async function resolveAvailableExtras(
  serviceClient: ServiceClient,
  request: ExtrasRequest
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
