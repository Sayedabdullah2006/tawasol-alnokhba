import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const body = await request.json()
    const requestId = typeof body.requestId === 'string' ? body.requestId : ''
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
    if (!requestId || !imageUrl) return NextResponse.json({ error: 'بيانات غير مكتملة' }, { status: 400 })

    const service = await createServiceRoleClient()
    const { data: publishRequest } = await service.from('publish_requests').select('content_images').eq('id', requestId).single()
    const images = Array.isArray(publishRequest?.content_images) ? publishRequest.content_images : []
    if (!images.includes(imageUrl)) return NextResponse.json({ error: 'الصورة لا تنتمي إلى هذا الطلب' }, { status: 422 })

    const { error } = await service.from('publish_requests').update({ admin_thumbnail_url: imageUrl }).eq('id', requestId)
    if (error) throw error
    return NextResponse.json({ success: true, imageUrl })
  } catch (error) {
    console.error('Request thumbnail update error:', error)
    return NextResponse.json({ error: 'تعذّر حفظ الصورة المصغرة' }, { status: 500 })
  }
}
