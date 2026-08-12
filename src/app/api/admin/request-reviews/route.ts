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
