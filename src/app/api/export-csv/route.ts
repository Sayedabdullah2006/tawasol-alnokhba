import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateRequestNumber } from '@/lib/utils'

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const scope = url.searchParams.get('scope')

    let query = supabase
      .from('publish_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (scope === 'membership') query = query.eq('billing_source', 'membership')
    if (scope === 'direct' || scope === 'inventor-store') query = query.neq('billing_source', 'membership')

    const { data: rawRequests } = await query
    const isStoreRequest = (subOption: unknown) => {
      if (typeof subOption !== 'string') return false
      try { return JSON.parse(subOption)?.source === 'inventor_store' } catch { return false }
    }
    let requests = rawRequests ?? []
    if (scope === 'inventor-store') requests = requests.filter(request => isStoreRequest(request.sub_option))
    if (scope === 'direct') requests = requests.filter(request => !isStoreRequest(request.sub_option))
    const service = url.searchParams.get('service')
    if (scope === 'inventor-store' && service) requests = requests.filter(request => {
      try { return JSON.parse(request.sub_option)?.product_slug === service } catch { return false }
    })

    if (!requests || requests.length === 0) {
      return new NextResponse('لا توجد بيانات', { status: 404 })
    }

    // Build CSV
    const headers = ['رقم الطلب', 'الاسم', 'البريد', 'الجوال', 'الفئة', 'المبلغ', 'الحالة', 'التاريخ']
    const rows = requests.map(r => [
      generateRequestNumber(r.request_number),
      r.client_name,
      r.client_email,
      r.client_phone,
      r.category,
      r.final_total ?? '',
      r.status,
      new Date(r.created_at).toLocaleDateString('ar-SA'),
    ])

    const BOM = '\uFEFF'
    const csv = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="requests-${Date.now()}.csv"`,
      },
    })
  } catch (err) {
    console.error('Export error:', err)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
