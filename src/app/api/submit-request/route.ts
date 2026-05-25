import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { generateRequestNumber } from '@/lib/utils'
import { notifyNewRequestToAdmin, notifyQuoteReadyToClient } from '@/lib/email'
import { CATEGORIES } from '@/lib/constants'
import { calculateAutoQuote } from '@/lib/auto-quote'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const serviceClient = await createServiceRoleClient()

    // ── تحديد المستخدم ──────────────────────────────────────────────────
    let userId: string | null = null
    try {
      const userClient = await createServerSupabaseClient()
      const { data: { user } } = await userClient.auth.getUser()
      if (user) userId = user.id
    } catch { /* not logged in */ }

    if (!userId) {
      try {
        const { data: users } = await serviceClient.auth.admin.listUsers()
        const existing = users?.users?.find(u => u.email === body.client_email)

        if (existing) {
          userId = existing.id
        } else {
          const tempPassword = Math.random().toString(36).slice(-10) + 'A1!'
          const { data: newUser } = await serviceClient.auth.admin.createUser({
            email: body.client_email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: body.client_name },
          })
          if (newUser?.user) {
            userId = newUser.user.id
            await serviceClient.from('profiles').upsert({
              id:       newUser.user.id,
              full_name: body.client_name,
              phone:    body.client_phone,
              city:     body.client_city,
              x_handle: body.x_handle,
            })
          }
        }
      } catch (e) {
        console.error('User lookup/creation error:', e)
      }
    }

    // ── احتساب السعر التلقائي ──────────────────────────────────────────
    const selectedExtras: string[] = Array.isArray(body.selected_extras) ? body.selected_extras : []
    const channels: string[]       = Array.isArray(body.channels) ? body.channels : []
    const scope = channels.length > 1 ? 'all' : 'single'

    const subOptionForCalc = body.sub_option &&
      typeof body.sub_option === 'object' &&
      'subcategory' in body.sub_option
        ? body.sub_option
        : (typeof body.sub_option === 'string' ? body.sub_option : null)

    const priceCalc = calculateAutoQuote({
      category:       body.category ?? '',
      subOption:      subOptionForCalc,
      clientType:     body.client_type ?? 'individual',
      selectedExtras,
    })

    const now = new Date().toISOString()

    // ── حفظ الطلب مع عرض السعر مباشرة ──────────────────────────────────
    const { data, error } = await serviceClient
      .from('publish_requests')
      .insert({
        user_id:          userId,
        influencer_id:    body.influencer_id,
        client_type:      body.client_type,
        category:         body.category,
        sub_option:       body.sub_option
          ? (typeof body.sub_option === 'object'
              ? JSON.stringify(body.sub_option)
              : body.sub_option)
          : null,
        channels,
        scope,
        images:           'one',
        extras:           selectedExtras,
        num_posts:        1,
        title:            body.title,
        content:          body.content,
        link:             body.link,
        hashtags:         body.hashtags,
        preferred_date:   body.preferred_date,
        content_images:   Array.isArray(body.content_images) ? body.content_images : [],
        client_name:      body.client_name,
        client_phone:     body.client_phone,
        client_email:     body.client_email,
        client_city:      body.client_city,
        x_handle:         body.x_handle,

        // ── حقول التسعير التلقائي ──
        base_price:            priceCalc.basePrice,
        extras_total:          priceCalc.extrasTotal,
        vat_amount:            priceCalc.vatAmount,
        total_amount:          priceCalc.total,
        admin_quoted_price:    priceCalc.total,
        admin_offered_extras:  [],
        user_selected_extras:  [],
        extras_selected_total: 0,
        final_total:           priceCalc.total,
        estimated_reach:       0,

        // ── حالة مباشرة إلى "مُسعَّر" ──
        status:            'quoted',
        quoted_at:         now,
        last_status_change: now,
        auto_quote_tier:   body.category,
        auto_quoted_at:    now,
        auto_quote_note:   `تسعير تلقائي — فئة: ${body.category}، إضافات: ${selectedExtras.length}`,
        updated_at:        now,
      })
      .select('request_number, id')
      .single()

    if (error) {
      console.error('Insert error:', error)
      return NextResponse.json({ error: 'فشل حفظ الطلب' }, { status: 500 })
    }

    const requestNumber = generateRequestNumber(data.request_number)

    // ── إرسال الإيميلات (لا تُوقف الاستجابة في حال الفشل) ─────────────
    const cat      = CATEGORIES.find(c => c.id === body.category)
    const catNameAr = cat?.nameAr ?? body.category

    // إيميل المدير (إشعار طلب جديد بالسعر)
    notifyNewRequestToAdmin({
      requestNumber,
      clientName:  body.client_name,
      clientEmail: body.client_email,
      clientPhone: body.client_phone,
      category:    catNameAr,
      title:       body.title,
      content:     body.content,
      channels,
    }).catch(e => console.error('Admin email failed:', e))

    // إيميل العميل (عرض السعر فوراً)
    if (body.client_email) {
      notifyQuoteReadyToClient({
        email:         body.client_email,
        requestNumber,
        clientName:    body.client_name ?? 'عزيزنا',
        price:         priceCalc.total,
        reach:         0,
        quoteExpiresAt: null,
        quickDiscountPct: null,
        quickDiscountDeadline: null,
      }).catch(e => console.error('Quote email failed:', e))
    }

    return NextResponse.json({
      requestNumber,
      quotedTotal: priceCalc.total,
    })
  } catch (err) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
