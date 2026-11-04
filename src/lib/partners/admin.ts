import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { PartnerError } from './auth'

export async function partnerAdmin() {
  const userDb = await createServerSupabaseClient()
  const { data: { user } } = await userDb.auth.getUser()
  if (!user) throw new PartnerError('UNAUTHORIZED', 401)
  const { data } = await userDb.from('profiles').select('role').eq('id', user.id).single()
  if (data?.role !== 'admin') throw new PartnerError('FORBIDDEN', 403)
  return createServiceRoleClient()
}
