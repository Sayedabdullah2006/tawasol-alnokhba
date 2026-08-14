import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getInventorStoreProduct } from '@/lib/inventor-store'
import {
  createEmptyDeliverableContent,
  getStudioForProduct,
  parseStoreRequestMeta,
} from '@/lib/inventor-store-studios'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ requestId: string }> }

type ChecklistItem = { label: string; done: boolean }
type DeliveryFile = { label: string; url: string; path?: string; format?: string }

async function requireAdmin() {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) }

  const service = await createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 403 }) }
  return { service, user }
}

function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const label = String(row.label || '').trim()
    return label ? [{ label, done: Boolean(row.done) }] : []
  })
}

function normalizeDeliveryFiles(value: unknown): DeliveryFile[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const label = String(row.label || '').trim()
    const url = String(row.url || '').trim()
    const path = String(row.path || '').trim()
    const format = String(row.format || '').trim()
    if (!label && !url && !path) return []
    return [{ label, url: path ? '' : url, ...(path ? { path } : {}), ...(format ? { format } : {}) }]
  })
}

function normalizeContent(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item ?? '')]),
  )
}

async function loadStoreRequest(service: Awaited<ReturnType<typeof createServiceRoleClient>>, requestId: string) {
  const { data, error } = await service
    .from('publish_requests')
    .select('id,request_number,user_id,title,content,content_images,supporting_documents,status,client_name,client_email,client_phone,sub_option,created_at,preferred_date,final_total,admin_quoted_price')
    .eq('id', requestId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const meta = parseStoreRequestMeta(data.sub_option)
  if (!meta) return null
  return { request: data, meta }
}

async function ensureWorkspace(
  service: Awaited<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
  requestId: string,
  productSlug: string,
) {
  const { data: existing, error: lookupError } = await service
    .from('inventor_store_workspaces')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle()
  if (lookupError) throw new Error(lookupError.message)
  if (existing) return existing

  const { data, error } = await service
    .from('inventor_store_workspaces')
    .insert({ request_id: requestId, product_slug: productSlug, created_by: userId })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return auth.error
    const { requestId } = await context.params
    const storeRequest = await loadStoreRequest(auth.service, requestId)
    if (!storeRequest) return NextResponse.json({ error: 'طلب المتجر غير موجود' }, { status: 404 })

    const product = getInventorStoreProduct(storeRequest.meta.product_slug)
    if (!product) return NextResponse.json({ error: 'خدمة المتجر المرتبطة بالطلب غير موجودة' }, { status: 404 })
    const studio = getStudioForProduct(product)
    const workspace = await ensureWorkspace(auth.service, auth.user.id, requestId, product.slug)

    const seedRows = studio.deliverables.map((definition, index) => ({
      workspace_id: workspace.id,
      deliverable_key: definition.key,
      title: definition.title,
      kind: definition.kind,
      sort_order: index,
      content: createEmptyDeliverableContent(definition),
      checklist: definition.checklist.map(label => ({ label, done: false })),
    }))
    if (seedRows.length) {
      const { error } = await auth.service
        .from('inventor_store_deliverables')
        .upsert(seedRows, { onConflict: 'workspace_id,deliverable_key', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    }

    const { data: deliverables, error: deliverablesError } = await auth.service
      .from('inventor_store_deliverables')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('sort_order')
    if (deliverablesError) throw new Error(deliverablesError.message)

    const deliverableIds = (deliverables ?? []).map(item => item.id)
    const versions = deliverableIds.length
      ? (await auth.service
          .from('inventor_store_deliverable_versions')
          .select('*')
          .in('deliverable_id', deliverableIds)
          .order('created_at', { ascending: false })).data ?? []
      : []

    const deliverablesWithSignedFiles = await Promise.all((deliverables ?? []).map(async item => {
      const files = normalizeDeliveryFiles(item.delivery_files)
      const hydratedFiles = await Promise.all(files.map(async file => {
        if (!file.path) return file
        const { data } = await auth.service.storage.from('inventor-store-deliverables').createSignedUrl(file.path, 3600)
        return { ...file, url: data?.signedUrl || '' }
      }))
      return {
        ...item,
        delivery_files: hydratedFiles,
        versions: versions.filter(version => version.deliverable_id === item.id),
      }
    }))

    return NextResponse.json({
      request: storeRequest.request,
      product,
      studio,
      workspace,
      deliverables: deliverablesWithSignedFiles,
    })
  } catch (error) {
    console.error('Inventor store workspace GET failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر تجهيز استديو الخدمة' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return auth.error
    const { requestId } = await context.params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || '')

    const storeRequest = await loadStoreRequest(auth.service, requestId)
    if (!storeRequest) return NextResponse.json({ error: 'طلب المتجر غير موجود' }, { status: 404 })
    const product = getInventorStoreProduct(storeRequest.meta.product_slug)
    if (!product) return NextResponse.json({ error: 'خدمة المتجر غير موجودة' }, { status: 404 })
    const workspace = await ensureWorkspace(auth.service, auth.user.id, requestId, product.slug)
    const now = new Date().toISOString()

    if (action === 'save_workspace') {
      const allowedStatuses = ['not_started', 'in_progress', 'internal_review', 'ready_for_delivery', 'completed']
      const status = String(body.status || workspace.status)
      if (!allowedStatuses.includes(status)) return NextResponse.json({ error: 'حالة الاستديو غير صحيحة' }, { status: 400 })
      const { data, error } = await auth.service
        .from('inventor_store_workspaces')
        .update({ status, internal_notes: String(body.internalNotes || ''), updated_at: now })
        .eq('id', workspace.id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ workspace: data })
    }

    if (action === 'save_deliverable') {
      const deliverableId = String(body.deliverableId || '')
      const { data: current, error: currentError } = await auth.service
        .from('inventor_store_deliverables')
        .select('*')
        .eq('id', deliverableId)
        .eq('workspace_id', workspace.id)
        .maybeSingle()
      if (currentError) throw new Error(currentError.message)
      if (!current) return NextResponse.json({ error: 'المخرج غير موجود' }, { status: 404 })

      const allowedStatuses = ['pending', 'drafting', 'internal_review', 'ready', 'sent', 'changes_requested', 'approved']
      const status = String(body.status || current.status)
      if (!allowedStatuses.includes(status)) return NextResponse.json({ error: 'حالة المخرج غير صحيحة' }, { status: 400 })
      const createVersion = Boolean(body.createVersion)
      if (createVersion) {
        const { error: versionError } = await auth.service.from('inventor_store_deliverable_versions').upsert({
          deliverable_id: current.id,
          version: current.version,
          content: current.content || {},
          checklist: current.checklist || [],
          delivery_files: current.delivery_files || [],
          change_note: String(body.changeNote || '').trim() || `حفظ الإصدار ${current.version}`,
          created_by: auth.user.id,
        }, { onConflict: 'deliverable_id,version', ignoreDuplicates: true })
        if (versionError) throw new Error(versionError.message)
      }

      const { data, error } = await auth.service
        .from('inventor_store_deliverables')
        .update({
          content: normalizeContent(body.content),
          checklist: normalizeChecklist(body.checklist),
          delivery_files: normalizeDeliveryFiles(body.deliveryFiles),
          internal_notes: String(body.internalNotes || ''),
          status,
          version: createVersion ? Number(current.version || 1) + 1 : current.version,
          updated_at: now,
        })
        .eq('id', current.id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)

      if (workspace.status === 'not_started') {
        await auth.service.from('inventor_store_workspaces').update({ status: 'in_progress', updated_at: now }).eq('id', workspace.id)
      }
      return NextResponse.json({ deliverable: data })
    }

    if (action === 'restore_version') {
      const deliverableId = String(body.deliverableId || '')
      const versionId = String(body.versionId || '')
      const { data: version, error: versionError } = await auth.service
        .from('inventor_store_deliverable_versions')
        .select('*, inventor_store_deliverables!inner(workspace_id,version,content,checklist,delivery_files)')
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
        .maybeSingle()
      if (versionError) throw new Error(versionError.message)
      const parent = version?.inventor_store_deliverables as unknown as { workspace_id: string; version: number; content: unknown; checklist: unknown; delivery_files: unknown } | null
      if (!version || !parent || parent.workspace_id !== workspace.id) return NextResponse.json({ error: 'الإصدار غير موجود' }, { status: 404 })
      const { error: snapshotError } = await auth.service.from('inventor_store_deliverable_versions').upsert({
        deliverable_id: deliverableId,
        version: parent.version,
        content: parent.content || {},
        checklist: parent.checklist || [],
        delivery_files: parent.delivery_files || [],
        change_note: `نسخة محفوظة قبل استعادة الإصدار ${version.version}`,
        created_by: auth.user.id,
      }, { onConflict: 'deliverable_id,version', ignoreDuplicates: true })
      if (snapshotError) throw new Error(snapshotError.message)
      const { error } = await auth.service
        .from('inventor_store_deliverables')
        .update({ content: version.content, checklist: version.checklist, delivery_files: version.delivery_files, version: Number(parent.version || 1) + 1, updated_at: now })
        .eq('id', deliverableId)
      if (error) throw new Error(error.message)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'الإجراء غير مدعوم' }, { status: 400 })
  } catch (error) {
    console.error('Inventor store workspace PATCH failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر حفظ استديو الخدمة' }, { status: 500 })
  }
}
