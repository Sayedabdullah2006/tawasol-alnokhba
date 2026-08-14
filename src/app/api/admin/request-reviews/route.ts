import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const service = await createServiceRoleClient()
  const { data, error } = await service
    .from('request_reviews')
    .select('request_id, rating, comment, invitation_sent_at, submitted_at')

  if (error) {
    console.error('Fetch request reviews error:', error)
    return NextResponse.json({ error: 'تعذّر تحميل التقييمات' }, { status: 500 })
  }
  return NextResponse.json({ reviews: data ?? [] })
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: 'رقم الطلب غير صالح' }, { status: 400 })
  }

  const service = await createServiceRoleClient()
  const { data, error } = await service
    .from('request_reviews')
    .update({ comment: null, updated_at: new Date().toISOString() })
    .eq('request_id', requestId)
    .not('comment', 'is', null)
    .select('request_id')
    .maybeSingle()

  if (error) {
    console.error('Delete request review comment error:', error)
    return NextResponse.json({ error: 'تعذّر حذف التعليق' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'التعليق غير موجود' }, { status: 404 })

  return NextResponse.json({ success: true })
}
