import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 403 }) }
  return { user }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const service = await createServiceRoleClient()
  const { data, error } = await service.from('generation_jobs')
    .select('id, scope, target_id, operation, status, error_message, created_at')
    .eq('owner_id', auth.user.id)
    .in('status', ['running', 'failed'])
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  let body: { id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'معرّف المهمة مطلوب' }, { status: 400 })
  const service = await createServiceRoleClient()
  const { error } = await service.from('generation_jobs').update({
    status: 'cancelled', completed_at: new Date().toISOString(),
  }).eq('id', body.id).eq('owner_id', auth.user.id).eq('status', 'running')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
