import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { parseStoreRequestMeta } from '@/lib/inventor-store-studios'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_FILE_SIZE = 200 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'text/plain', 'image/png', 'image/jpeg', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
])

function safeName(name: string) {
  const extension = name.includes('.') ? `.${name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}` : ''
  return `${Date.now()}-${crypto.randomUUID()}${extension}`
}

export async function POST(request: Request) {
  try {
    const auth = await createServerSupabaseClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const service = await createServiceRoleClient()
    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const form = await request.formData()
    const file = form.get('file')
    const requestId = String(form.get('requestId') || '')
    const deliverableKey = String(form.get('deliverableKey') || '').replace(/[^a-zA-Z0-9_-]/g, '')
    if (!(file instanceof File) || !requestId || !deliverableKey) return NextResponse.json({ error: 'بيانات الملف غير مكتملة' }, { status: 400 })
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'الحد الأقصى للملف 200 ميجابايت' }, { status: 400 })
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'صيغة الملف غير مدعومة' }, { status: 400 })

    const { data: publishRequest } = await service.from('publish_requests').select('sub_option').eq('id', requestId).maybeSingle()
    if (!parseStoreRequestMeta(publishRequest?.sub_option)) return NextResponse.json({ error: 'طلب المتجر غير موجود' }, { status: 404 })

    const path = `${requestId}/${deliverableKey}/${safeName(file.name)}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error } = await service.storage.from('inventor-store-deliverables').upload(path, bytes, { contentType: file.type, upsert: false })
    if (error) throw new Error(error.message)
    const { data: signed, error: signError } = await service.storage.from('inventor-store-deliverables').createSignedUrl(path, 3600)
    if (signError) throw new Error(signError.message)
    return NextResponse.json({ file: { label: file.name, path, url: signed.signedUrl, format: file.name.split('.').pop()?.toUpperCase() || file.type } })
  } catch (error) {
    console.error('Inventor store deliverable upload failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر رفع الملف' }, { status: 500 })
  }
}
