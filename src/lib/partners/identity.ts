import { createServiceRoleClient } from '@/lib/supabase-server'
import { first1SaudiClientId } from '@/lib/sso'
import { PartnerError, parseBody, uuid, type PartnerContext } from './auth'
import {globalLogoutTicket} from '@/lib/global-logout'

export async function partnerIdentity(ctx: PartnerContext, action: string) {
  if (ctx.client.id !== 'awwal-saudi') throw new PartnerError('IDENTITY_CLIENT_NOT_ALLOWED',403)
  if (!['session','link','logout'].includes(action)) throw new PartnerError('NOT_FOUND',404)
  const body = parseBody(ctx)
  if (Object.keys(body).some(key => key !== 'access_token' && !(action==='logout'&&key==='scope')) || typeof body.access_token !== 'string' || body.access_token.length > 16000 || (body.scope!==undefined&&!['local','global'].includes(String(body.scope)))) throw new PartnerError('INVALID_IDENTITY')
  const db = await createServiceRoleClient()
  // Auth validates the signed JWT before any decoded claims are used. Email never selects an owner.
  const { data: { user }, error } = await db.auth.getUser(body.access_token)
  if (error && ((error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError')) throw new PartnerError('IDENTITY_UNAVAILABLE',503)
  if (error || !user || !user.email_confirmed_at) throw new PartnerError('IDENTITY_SESSION_INVALID',401)
  let claims
  try { claims = JSON.parse(Buffer.from(body.access_token.split('.')[1],'base64url').toString('utf8')) } catch { throw new PartnerError('IDENTITY_SESSION_INVALID',401) }
  const client = first1SaudiClientId()
  const issuer = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
  if (claims.sub !== user.id || claims.client_id !== client || claims.iss !== issuer || !Number.isFinite(claims.exp) || claims.exp*1000<=Date.now()) throw new PartnerError('IDENTITY_SESSION_INVALID',401)
  const session = uuid(claims.session_id)
  const valid = await db.rpc('partner_identity_session_valid',{p_user:user.id,p_session:session,p_client:client})
  if (valid.error) throw new PartnerError('IDENTITY_UNAVAILABLE',503)
  if (valid.data !== true) throw new PartnerError('IDENTITY_SESSION_INVALID',401)
  if (action === 'logout') {
    const global=body.scope==='global'
    if(global){
      const link=await db.from('partner_identity_links').select('external_customer_id').eq('partner_id',ctx.client.id).eq('auth_user_id',user.id).maybeSingle()
      if(link.error)throw new PartnerError('IDENTITY_UNAVAILABLE',503)
      if(link.data?.external_customer_id!==ctx.customer)throw new PartnerError('IDENTITY_LINK_CONFLICT',409)
    }
    const result = await db.auth.admin.signOut(body.access_token,global?'global':'local')
    if (result.error) throw new PartnerError('IDENTITY_UNAVAILABLE',503)
    return global?{logged_out:true,scope:'global',logout_url:'https://nukhba.media/api/oauth/logout?ticket='+encodeURIComponent(globalLogoutTicket(user.id))}:{ logged_out:true, scope:'oauth_session' }
  }
  if (action === 'link') {
    const result = await db.rpc('partner_link_identity',{p_partner:ctx.client.id,p_customer:ctx.customer,p_user:user.id,p_session:session,p_client:client})
    if (result.error) {
      const conflict = result.error.message.includes('IDENTITY_LINK_CONFLICT')
      const invalid = result.error.message.includes('IDENTITY_SESSION_INVALID')
      throw new PartnerError(conflict?'IDENTITY_LINK_CONFLICT':invalid?'IDENTITY_SESSION_INVALID':'IDENTITY_UNAVAILABLE',conflict?409:invalid?401:503)
    }
    return result.data
  }
  const [link, profile] = await Promise.all([
    db.from('partner_identity_links').select('external_customer_id,linked_at').eq('partner_id',ctx.client.id).eq('auth_user_id',user.id).maybeSingle(),
    db.from('profiles').select('full_name,phone,city,x_handle').eq('id',user.id).maybeSingle(),
  ])
  if (link.error || profile.error) throw new PartnerError('IDENTITY_UNAVAILABLE',503)
  return { issuer, subject:user.id, email:user.email, email_verified:true, profile:profile.data, link:link.data, expires_at:new Date(claims.exp*1000).toISOString() }
}
