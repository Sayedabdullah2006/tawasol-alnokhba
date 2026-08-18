import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { ORDERABLE_PACKAGES } from '@/lib/constants'
import {
  createDraftAccess,
  normalizeRecoveryEmail,
  parseRecoveryToken,
  verifyLocalRecoverySecret,
} from '@/lib/request-recovery'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PAYLOAD_CHARS = 120_000

type RecoveryDraftRow = {
  id: string
  user_id: string | null
  access_token_hash: string
  client_email: string
  client_name: string | null
  selected_package: string
  draft_payload: Record<string, unknown>
  status: string
  offer_code: string | null
  offer_expires_at: string | null
}

async function authorizeDraft(token: string): Promise<RecoveryDraftRow | null> {
  const parsed = parseRecoveryToken(token)
  if (!parsed) return null
  const service = await createServiceRoleClient()
  const { data } = await service
    .from('request_recovery_drafts')
    .select('id, user_id, access_token_hash, client_email, client_name, selected_package, draft_payload, status, offer_code, offer_expires_at')
    .eq('id', parsed.id)
    .maybeSingle()
  if (!data) return null
  if (!parsed.emailSigned && (!parsed.localSecret || !verifyLocalRecoverySecret(parsed.localSecret, data.access_token_hash))) {
    return null
  }
  return data as RecoveryDraftRow
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const draft = await authorizeDraft(token)
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user || !draft || draft.user_id !== user.id || draft.status !== 'active') {
    return NextResponse.json({ error: 'تعذّر العثور على المسودة أو انتهت صلاحيتها' }, { status: 404 })
  }
  const offerActive = !!draft.offer_code
    && !!draft.offer_expires_at
    && new Date(draft.offer_expires_at).getTime() > Date.now()
  return NextResponse.json({
    id: draft.id,
    payload: draft.draft_payload,
    clientEmail: draft.client_email,
    clientName: draft.client_name,
    selectedPackage: draft.selected_package,
    offer: offerActive ? {
      code: draft.offer_code,
      discountPct: 5,
      maxDiscountAmount: 150,
      expiresAt: draft.offer_expires_at,
    } : null,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user?.email) return NextResponse.json({ error: 'يلزم تسجيل الدخول لحفظ المسودة' }, { status: 401 })
    const email = normalizeRecoveryEmail(user.email)
    const selectedPackage = String(body.selectedPackage ?? '')
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
    if (!EMAIL_RE.test(email) || !ORDERABLE_PACKAGES.some(pkg => pkg.id === selectedPackage)) {
      return NextResponse.json({ skipped: true })
    }
    if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) {
      return NextResponse.json({ error: 'حجم المسودة أكبر من المسموح' }, { status: 413 })
    }

    const service = await createServiceRoleClient()
    const suppliedToken = typeof body.token === 'string' ? body.token : ''
    const existing = suppliedToken ? await authorizeDraft(suppliedToken) : null
    const now = new Date().toISOString()
    const values = {
      user_id: user.id,
      client_email: email,
      client_name: String(body.clientName ?? '').trim() || null,
      client_phone: String(body.clientPhone ?? '').trim() || null,
      selected_package: selectedPackage,
      estimated_total: Number.isFinite(Number(body.estimatedTotal)) ? Number(body.estimatedTotal) : null,
      draft_payload: payload,
      last_activity_at: now,
      updated_at: now,
    }

    if (existing?.status === 'active' && existing.user_id === user.id) {
      const { error } = await service.from('request_recovery_drafts').update(values).eq('id', existing.id)
      if (error) throw error
      return NextResponse.json({ id: existing.id, token: suppliedToken })
    }

    const id = randomUUID()
    const access = createDraftAccess(id)
    const { error } = await service.from('request_recovery_drafts').insert({
      id,
      access_token_hash: access.tokenHash,
      ...values,
    })
    if (error) throw error
    return NextResponse.json({ id, token: access.token })
  } catch (error) {
    console.error('[REQUEST RECOVERY] Draft save failed:', error)
    return NextResponse.json({ error: 'تعذّر حفظ المسودة' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { token?: string; requestId?: string }
    const draft = body.token ? await authorizeDraft(body.token) : null
    const client = await createServerSupabaseClient()
    const { data: { user } } = await client.auth.getUser()
    if (!draft || !user || draft.user_id !== user.id) return NextResponse.json({ ok: true })
    const service = await createServiceRoleClient()
    const now = new Date().toISOString()
    await service.from('request_recovery_drafts').update({
      status: body.requestId ? 'recovered' : 'completed',
      recovered_request_id: body.requestId ?? null,
      completed_at: now,
      updated_at: now,
    }).eq('id', draft.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
