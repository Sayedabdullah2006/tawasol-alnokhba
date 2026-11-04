import { createServiceRoleClient } from '@/lib/supabase-server'
import { PartnerError, type PartnerClient } from './auth'

/** Acceptance uses distinct tables, RPCs and private storage; never production orders. */
export async function partnerData(client?: Pick<PartnerClient, 'sandbox_only'> | boolean) {
  const db = await createServiceRoleClient()
  const sandbox = client === true || (typeof client === 'object' && client?.sandbox_only === true)
  if (!sandbox) return db
  const tables: Record<string, string> = {
    publish_requests: 'partner_sandbox_orders', partner_quotes: 'partner_sandbox_quotes',
    partner_checkout_sessions: 'partner_sandbox_checkout_sessions', partner_files: 'partner_sandbox_files',
    partner_payment_receipts: 'partner_sandbox_payment_receipts', discount_codes: 'partner_sandbox_discounts', partner_order_actions: 'partner_sandbox_order_actions',
  }
  const rpcs = new Set(['partner_create_order', 'partner_create_checkout', 'partner_settle_payment', 'partner_reserve_file', 'partner_cancel_order', 'partner_create_organization_order', 'partner_offer_action'])
  return new Proxy(db, { get(target, key) {
    if (key === 'from') return (table: string) => {
      if (!tables[table] && !['influencers','extras','pricing_config'].includes(table)) throw new PartnerError('SANDBOX_RESOURCE_NOT_ALLOWED', 503)
      return target.from(tables[table] ?? table)
    }
    if (key === 'rpc') return (name: string, args: Record<string, unknown>) => {
      if (!rpcs.has(name)) throw new PartnerError('SANDBOX_RESOURCE_NOT_ALLOWED', 503)
      return target.rpc(name.replace('partner_', 'partner_sandbox_'), args)
    }
    if (key === 'storage') return new Proxy(target.storage, { get(storage, prop) {
      if (prop === 'from') return (bucket: string) => {
        if (bucket !== 'partner-files') throw new PartnerError('SANDBOX_RESOURCE_NOT_ALLOWED', 503)
        return storage.from('partner-sandbox-files')
      }
      return Reflect.get(storage, prop)
    } })
    return Reflect.get(target, key)
  } })
}
