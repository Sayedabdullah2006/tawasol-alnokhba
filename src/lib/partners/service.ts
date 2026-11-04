import { partnerPaymentMode, partnerGateway } from './payment-mode'
import { validateNews } from '@/lib/individual-news'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { CATEGORIES, EXTRAS } from '@/lib/constants'
import { calculateAutoQuote, parseSubOption } from '@/lib/auto-quote'
import { PACKAGE_VERSION, type IndividualPackage, SINGLE_PACKAGES, getIndividualPackage, priceIndividualPackage, resolvePackageChannels } from '@/lib/individual-packages'
import { PartnerContext, PartnerError, parseBody, sha256, text, uuid } from './auth'
import { checkoutOrigin, checkoutToken } from './checkout'

const UUID = /^[a-f0-9-]{36}$/i
const ALLOWED_EXTRAS = EXTRAS.filter(e => !['website', 'media', 'plan'].includes(e.id))
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const ORDER_FIELDS = 'id,request_number,partner_id,external_customer_id,external_order_id,source_site,category,title,content,channels,status,payment_status,final_total,package_snapshot,created_at,updated_at,proposed_content,proposed_images,post_reviews,content_sent_at,content_approved_at,user_feedback,admin_info_request,partner_deliverables,refund_amount,refund_timing,paid_at'
function dbError(error: { message: string } | null) {
  if (!error) return
  const known = ['QUOTE_EXPIRED','QUOTE_NOT_FOUND','QUOTE_CONSUMED','IDEMPOTENCY_CONFLICT','ORDER_NOT_FOUND','ORDER_NOT_PAYABLE','CHECKOUT_EXPIRED','DISCOUNT_UNAVAILABLE','FILE_LIMIT','ORDER_NOT_EDITABLE','OPEN_REQUEST_EXISTS','ORDER_NOT_CANCELLABLE','CHECKOUT_ACTIVE']
  const code = known.find(c => error.message.includes(c))
  throw new PartnerError(code ?? 'STORAGE_UNAVAILABLE', code ? 409 : 503)
}
function channelsOf(row: Record<string, unknown>) {
  return [['x', 'x_followers'], ['li', 'li_followers'], ['ig', 'ig_followers'], ['tk', 'tk_followers']].filter(([, field]) => Number(row[field]) > 0).map(([ch]) => ch)
}

function revision(order: Record<string, unknown>) {
  return sha256(JSON.stringify([order.proposed_content, order.proposed_images, order.content_sent_at]))
}
async function owned(ctx: PartnerContext, id: string) {
  const db = await createServiceRoleClient()
  const { data, error } = await db.from('publish_requests').select(ORDER_FIELDS).eq('id', uuid(id)).eq('partner_id', ctx.client.id).eq('external_customer_id', ctx.customer).single()
  if (error || !data) throw new PartnerError('ORDER_NOT_FOUND', 404)
  const review = data.post_reviews?.[0]
  return review?.proposed_content ? { ...data, proposed_content: review.proposed_content, proposed_images: review.proposed_images ?? [], content_sent_at: review.content_sent_at ?? data.content_sent_at } : data
}
function expose(order: Record<string, unknown>) {
  const { final_total, refund_amount, package_snapshot } = order
  const safe = Object.fromEntries(Object.entries(order).filter(([key]) => !['partner_id','external_customer_id','post_reviews','final_total','refund_amount','package_snapshot'].includes(key)))
  return { ...safe, amount: Math.round(Number(final_total) * 100), refund_amount: refund_amount === null ? null : Math.round(Number(refund_amount) * 100), package_snapshot: publicSnapshot(package_snapshot), content_revision: revision(order) }
}
function publicSnapshot(raw: unknown) {
  if (!raw) return null
  const value = raw as { version: string; package: IndividualPackage; pricing: ReturnType<typeof priceIndividualPackage> }
  return { version: value.version, pricing: value.pricing, package: { id: value.package.id, name: value.package.name, features: value.package.features, included_extras: value.package.includedExtras, channel_count: value.package.channelCount, channels: value.package.channels ?? null } }
}
async function publisher(ctx: PartnerContext, id: string) {
  if (!ctx.client.influencer_ids?.includes(id)) throw new PartnerError('PUBLISHER_UNAVAILABLE')
  const db = await createServiceRoleClient()
  const { data } = await db.from('influencers').select('id,name_ar,x_followers,ig_followers,li_followers,tk_followers').eq('id', uuid(id)).eq('is_active', true).single()
  if (!data) throw new PartnerError('PUBLISHER_UNAVAILABLE')
  return data
}
async function discount(code: unknown) {
  if (code === undefined || code === '') return { pct: 0, code: null, cap: null as number | null }
  const normalized = text(code, 64).toUpperCase()
  const db = await createServiceRoleClient()
  const { data } = await db.from('discount_codes').select('code,discount_pct,is_active,expires_at,max_uses,used_count,max_discount_amount,recovery_draft_id').eq('code', normalized).single()
  if (data?.recovery_draft_id || !data?.is_active || (data.expires_at && Date.parse(data.expires_at) <= Date.now()) || (data.max_uses !== null && data.used_count >= data.max_uses)) throw new PartnerError('DISCOUNT_UNAVAILABLE')
  return { pct: Number(data.discount_pct), code: normalized, cap: data.max_discount_amount == null ? null : Number(data.max_discount_amount) }
}
async function fileLinks(id: string) {
  const db = await createServiceRoleClient()
  const { data, error } = await db.from('partner_files').select('id,path,name,mime_type,size').eq('request_id', id).eq('completed', true)
  dbError(error)
  return Promise.all((data ?? []).map(async f => {
    const { data: signed, error: signError } = await db.storage.from('partner-files').createSignedUrl(f.path, 300)
    dbError(signError)
    return { id: f.id, name: f.name, mime_type: f.mime_type, size: f.size, url: signed?.signedUrl, expires_in: 300 }
  }))
}
export async function partnerOperation(request: Request, ctx: PartnerContext, path: string[]) {
  const db = await createServiceRoleClient()
  const method = request.method
  if (method === 'GET' && path.join('/') === 'catalog') {
    const { data, error } = await db.from('influencers').select('id,name_ar,x_followers,ig_followers,li_followers,tk_followers').in('id', ctx.client.influencer_ids.filter(id => UUID.test(id))).eq('is_active', true)
    dbError(error)
    return { version: PACKAGE_VERSION, currency: 'SAR', money_unit: 'halala', seller: 'شركة تواصل النخبة للدعاية والإعلان',
      packages: SINGLE_PACKAGES.map(p => ({ id: p.id, name: p.name, blurb: p.blurb, surcharge: p.surcharge * 100, fixed_price: p.fixedPrice ? p.fixedPrice * 100 : null, starts_from: (p.fixedPrice ?? 499 + p.surcharge) * 100, advertising: p.sponsoredCampaignBudget * 100, channel_count: p.channelCount, channels: p.channels ?? null, features: p.features, included_extras: p.includedExtras })), extras: ALLOWED_EXTRAS.map(e => ({ id: e.id, name: e.nameAr, price: e.price * 100 })),
      categories: CATEGORIES.filter(c => !c.clientTypes || c.clientTypes.includes('individual')).map(c => ({ id: c.id, name: c.nameAr, requires_sub_option: !!c.hasSubOption,
        base_price: c.hasSubOption ? null : calculateAutoQuote({ category: c.id, clientType: 'individual', selectedExtras: [] }).singleChannelBase * 100 })),
      sub_options: {
        inventions: ['with_patent','no_patent'].map(id => ({ id, base_price: calculateAutoQuote({ category: 'inventions', subOption: id, selectedExtras: [] }).singleChannelBase * 100 })),
        competitions: Object.fromEntries(Object.entries({ international: ['first','second','third','top_10','top_50','participation'], local: ['first','second','third','top_10','top_50','participation'], hackathon: ['first','second','third','finalist','participation'] }).map(([subcategory, positions]) => [subcategory, positions.map(position => ({ position, base_price: calculateAutoQuote({ category: 'competitions', subOption: { subcategory, position }, selectedExtras: [] }).singleChannelBase * 100 }))])),
      }, publishers: (data ?? []).map(p => ({ id: p.id, name: p.name_ar, channels: channelsOf(p) })),
      career_fields: ['language', 'goal', 'experience', 'education'], tax_policy: 'existing_no_added_vat',
      limits: { file_bytes: 20971520, files_per_order: 10, quote_seconds: 1800, checkout_seconds: 1800 } }
  }
  if (method === 'POST' && path.join('/') === 'quotes') {
    const body = parseBody(ctx)
    const pkg = getIndividualPackage(text(body.package_id, 40))
    if (!pkg) throw new PartnerError('INVALID_PACKAGE')
    const category = text(body.category, 40)
    try { validateNews(category, body.sub_option) } catch (error) { throw new PartnerError(error instanceof Error ? error.message : 'INVALID_CATEGORY') }
    if (pkg.id === 'v2_career' && category !== 'cv') throw new PartnerError('INVALID_CATEGORY')
    const pub = await publisher(ctx, text(body.influencer_id, 36))
    const selected = Array.isArray(body.channels) && body.channels.every(c => typeof c === 'string') ? body.channels as string[] : []
    let channels: string[]
    try { channels = resolvePackageChannels(pkg, selected, channelsOf(pub)) } catch { throw new PartnerError('INVALID_PACKAGE_CHANNELS') }
    const ids = body.extras ?? []
    if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== 'string' || !ALLOWED_EXTRAS.some(e => e.id === id))) throw new PartnerError('INVALID_EXTRAS')
    const extras = ALLOWED_EXTRAS.filter(e => ids.includes(e.id))
    if (extras.some(e => e.id === 'infographic') && category !== 'cv') throw new PartnerError('INVALID_EXTRAS')
    const deal = await discount(body.discount_code)
    const base = calculateAutoQuote({ category, subOption: parseSubOption(body.sub_option as string), selectedExtras: [] }).singleChannelBase
    const effectivePkg = pkg.id === 'v2_reach' && channels.includes('tk') ? { ...pkg, includedExtras: [...pkg.includedExtras, 'video'] } : pkg
    const pricing = priceIndividualPackage(base, effectivePkg, extras, deal.pct)
    if (deal.cap !== null) { pricing.discount = Math.min(pricing.discount, Math.round(deal.cap * 100)); pricing.total = pricing.subtotal - pricing.discount }
    if (pricing.total <= 0) throw new PartnerError('ZERO_PAYMENT_UNSUPPORTED')
    const snapshot = { version: PACKAGE_VERSION, package: effectivePkg, pricing }
    const payload = { category, sub_option: typeof body.sub_option === 'object' ? JSON.stringify(body.sub_option) : body.sub_option ?? null,
      influencer_id: pub.id, channels, discount_code: deal.code }
    const { data, error } = await db.from('partner_quotes').insert({ partner_id: ctx.client.id, customer_id: ctx.customer, snapshot, payload, expires_at: new Date(Date.now() + 1800000).toISOString() }).select('id,expires_at,snapshot,payload').single()
    dbError(error); if (!data) throw new PartnerError('STORAGE_UNAVAILABLE', 503); return { ...data, snapshot: publicSnapshot(data.snapshot) }
  }
  if (method === 'POST' && path.join('/') === 'orders') {
    const body = parseBody(ctx)
    const customer = body.customer as Record<string, unknown>
    if (!customer || typeof customer !== 'object') throw new PartnerError('INVALID_CUSTOMER')
    const content = { title: text(body.title, 300), content: text(body.content, 20000), name: text(customer.name, 160),
      phone: text(customer.phone, 30), email: text(customer.email, 254), city: text(customer.city, 100, false), handle: text(customer.handle, 100, false) }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.email) || !/^\+?[\d ()-]{7,30}$/.test(content.phone)) throw new PartnerError('INVALID_CUSTOMER')
    const quote = uuid(body.quote_id)
    const { data: q } = await db.from('partner_quotes').select('payload,snapshot,order_id').eq('id', quote).eq('partner_id', ctx.client.id).eq('customer_id', ctx.customer).single()
    if (!q) throw new PartnerError('QUOTE_NOT_FOUND', 404)
    if (!q.order_id) {
      const currentPub = await publisher(ctx, q.payload.influencer_id)
      try { resolvePackageChannels(q.snapshot.package, q.payload.channels, channelsOf(currentPub)) } catch { throw new PartnerError('PUBLISHER_UNAVAILABLE') }
    }
    if (q.snapshot.package.id === 'v2_career') {
      const career = body.career as Record<string, unknown>
      if (!career || !['ar','en'].includes(String(career.language))) throw new PartnerError('CAREER_DETAILS_REQUIRED')
      content.content += '\n\n' + JSON.stringify({ language: career.language, goal: text(career.goal, 2000), experience: text(career.experience, 6000), education: text(career.education, 3000) })
    }
    const fingerprint = sha256(JSON.stringify({ quote, content }))
    const { data, error } = await db.rpc('partner_create_order', { p_partner: ctx.client.id, p_customer: ctx.customer, p_key: ctx.idempotencyKey, p_fingerprint: fingerprint, p_quote: quote, p_content: content })
    dbError(error); return data
  }
  if (method === 'GET' && path.join('/') === 'orders') {
    const query = new URL(request.url).searchParams
    const page = Math.max(0, Math.min(10000, Number(query.get('page') ?? 0)))
    if (!Number.isInteger(page)) throw new PartnerError('INVALID_PAGE')
    const { data, error } = await db.from('publish_requests').select(ORDER_FIELDS).eq('partner_id', ctx.client.id).eq('external_customer_id', ctx.customer).order('created_at', { ascending: false }).range(page * 20, page * 20 + 19)
    dbError(error); return { orders: (data ?? []).map(expose), page }
  }
  if (path[0] !== 'orders' || !path[1]) throw new PartnerError('NOT_FOUND', 404)
  const order = await owned(ctx, path[1])
  if (method === 'GET' && path.length === 2) return { ...expose(order), files: await fileLinks(order.id) }
  if (method === 'POST' && path.length === 3 && path[2] === 'cancel') {
    const { data, error } = await db.rpc('partner_cancel_order', { p_partner: ctx.client.id, p_customer: ctx.customer, p_request: order.id })
    dbError(error); return data
  }

  if (method === 'POST' && path.length === 3 && path[2] === 'information') {
    if (order.status !== 'info_requested') throw new PartnerError('ORDER_NOT_EDITABLE', 409)
    const body = parseBody(ctx)
    const content = text(body.content, 20000)
    const { data, error } = await db.from('publish_requests').update({ content, status: 'in_progress', updated_at: new Date().toISOString(), last_status_change: new Date().toISOString() })
      .eq('id', order.id).eq('partner_id', ctx.client.id).eq('external_customer_id', ctx.customer).eq('status', 'info_requested').eq('updated_at', order.updated_at).select('id')
    dbError(error)
    if (!data?.length) throw new PartnerError('ORDER_CHANGED', 409)
    return { id: order.id, status: 'in_progress' }
  }
  if (method === 'POST' && path.length === 3 && path[2] === 'checkout') {
    // Validate configuration before creating a durable session.
    checkoutToken('00000000-0000-4000-8000-000000000000')
    const paymentMode = partnerPaymentMode(); partnerGateway(paymentMode)
    let returnUrl: URL
    try { returnUrl = new URL(ctx.client.return_url) } catch { throw new PartnerError('RETURN_URL_NOT_CONFIGURED', 503) }
    if (returnUrl.protocol !== 'https:') throw new PartnerError('RETURN_URL_NOT_CONFIGURED', 503)
    returnUrl.searchParams.set('order_id', order.id)
    const { data, error } = await db.rpc('partner_create_checkout', { p_partner: ctx.client.id, p_customer: ctx.customer, p_request: order.id, p_key: ctx.idempotencyKey, p_return: returnUrl.toString(), p_mode: paymentMode })
    dbError(error)
    return { checkout_url: `${checkoutOrigin()}/checkout/partner#token=${encodeURIComponent(checkoutToken(data.id))}`, expires_at: data.expires_at }
  }
  if (method === 'POST' && path.length === 3 && path[2] === 'review') {
    const body = parseBody(ctx)
    if (order.status !== 'content_review' || text(body.content_revision, 64) !== revision(order)) throw new PartnerError('CONTENT_CHANGED', 409)
    const action = text(body.action, 20)
    if (!['approve','changes'].includes(action)) throw new PartnerError('INVALID_ACTION')
    const feedback = action === 'changes' ? text(body.feedback, 4000) : null
    const images = Array.isArray(order.proposed_images) ? order.proposed_images : []
    if (body.selected_image && !images.includes(body.selected_image)) throw new PartnerError('INVALID_IMAGE')
    const now = new Date().toISOString()
    const update = action === 'approve' ? { status: 'in_progress', content_approved_at: now, user_feedback: null,
      post_reviews: { ...order.post_reviews, 0: { ...order.post_reviews?.[0], status: 'approved', proposed_content: order.proposed_content, proposed_images: images, selected_image: body.selected_image ?? images[0] ?? null, content_approved_at: now } } } : { status: 'changes_requested', user_feedback: feedback, feedback_sent_at: now, post_reviews: { ...order.post_reviews, 0: { ...order.post_reviews?.[0], status: 'changes_requested', user_feedback: feedback, feedback_sent_at: now } } }
    const { data, error } = await db.from('publish_requests').update({ ...update, updated_at: now, last_status_change: now }).eq('id', order.id).eq('partner_id', ctx.client.id).eq('external_customer_id', ctx.customer).eq('status', 'content_review').eq('updated_at', order.updated_at).select('id')
    dbError(error)
    if (!data?.length) throw new PartnerError('CONTENT_CHANGED', 409)
    if (ctx.client.notifications !== false) {
      const mail = await import('@/lib/email')
      if (action === 'approve') await mail.notifyContentApprovedToAdmin({ requestNumber: String(order.request_number), clientName: 'عميل أول سعودي' }).catch(() => undefined)
      else await mail.notifyContentChangesRequested({ requestNumber: String(order.request_number), clientName: 'عميل أول سعودي', feedback: feedback ?? '', proposedContent: order.proposed_content ?? '' }).catch(() => undefined)
    }
    return { id: order.id, status: update.status }
  }
  if (method === 'POST' && path.length === 3 && path[2] === 'files') {
    if (!['approved','in_progress','info_requested','content_review','changes_requested'].includes(order.status)) throw new PartnerError('ORDER_NOT_EDITABLE', 409)
    const body = parseBody(ctx); const name = text(body.name, 180); const mime = text(body.mime_type, 100); const size = Number(body.size)
    if (!MIME.includes(mime) || !Number.isSafeInteger(size) || size <= 0 || size > 20971520) throw new PartnerError('INVALID_FILE')
    const proposedId = crypto.randomUUID(); const proposedPath = `${ctx.client.id}/${order.id}/${proposedId}`
    const { data: file, error } = await db.rpc('partner_reserve_file', { p_partner: ctx.client.id, p_customer: ctx.customer, p_request: order.id, p_key: ctx.idempotencyKey, p_id: proposedId, p_path: proposedPath, p_name: name, p_mime: mime, p_size: size })
    dbError(error)
    if (file.completed) return { id: file.id, completed: true }
    const id = file.id
    const { data: signed, error: signError } = await db.storage.from('partner-files').createSignedUploadUrl(file.path, { upsert: false })
    dbError(signError)
    return { id, upload_url: signed?.signedUrl, method: 'PUT', content_type: mime, expires_in: 7200 }
  }
  if (method === 'POST' && path.length === 5 && path[2] === 'files' && path[4] === 'complete') {
    const { data: file } = await db.from('partner_files').select('*').eq('id', uuid(path[3])).eq('request_id', order.id).single()
    if (!file) throw new PartnerError('FILE_NOT_FOUND', 404)
    const { data: info, error } = await db.storage.from('partner-files').info(file.path)
    if (error || Number(info?.size) !== file.size || info?.contentType !== file.mime_type) throw new PartnerError('FILE_UPLOAD_MISMATCH')
    const { error: updateError } = await db.from('partner_files').update({ completed: true }).eq('id', file.id)
    dbError(updateError)
    return { id: file.id, completed: true }
  }
  throw new PartnerError('NOT_FOUND', 404)
}
