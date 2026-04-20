import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface OfferedExtra {
  id: string
  name: string
  price: number
  reachBoost: number
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const body = await request.json()
    const { requestId, quotedPrice, offeredExtras, adminNotes, baseReach } = body as {
      requestId: string
      quotedPrice: number
      offeredExtras: OfferedExtra[]
      adminNotes?: string
      baseReach: number
    }

    if (typeof quotedPrice !== 'number' || quotedPrice < 0) {
      return NextResponse.json({ error: 'السعر غير صالح' }, { status: 400 })
    }

    const { error } = await supabase
      .from('publish_requests')
      .update({
        admin_quoted_price: quotedPrice,
        admin_offered_extras: offeredExtras ?? [],
        user_selected_extras: [],
        extras_selected_total: 0,
        final_total: quotedPrice,
        estimated_reach: baseReach ?? 0,
        status: 'quoted',
        quoted_at: new Date().toISOString(),
        admin_notes: adminNotes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Send quote error:', error)
      return NextResponse.json({ error: 'فشل إرسال التسعيرة' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Quote error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
