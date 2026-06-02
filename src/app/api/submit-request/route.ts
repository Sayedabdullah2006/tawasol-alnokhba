import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { generateRequestNumber } from '@/lib/utils'
import { notifyNewRequestToAdmin, notifyQuoteReadyToClient } from '@/lib/email'
import { CATEGORIES, PACKAGES } from '@/lib/constants'
import { calculateAutoQuote, calculateCampaignQuote, CAMPAIGN_DISCOUNT_PCT } from '@/lib/auto-quote'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const serviceClient = await createServiceRoleClient()

    // ── تحديد المستخدم ───────────────────────────────────────────
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
              id:        newUser.user.id,
              full_name: body.client_name,
              phone:     body.client_phone,
              city:      body.client_city,
              x_handle:  body.x_handle,
            })
          }
        }
      } catch (e) {
        console.error('User lookup/creation error:', e)
      }
    }

    // ── منع تقديم طلب جديد عند وجود عرض بانتظار موافقة العميل ──────
    // لا يحق للعميل رفع طلب جديد ما دام لديه عرض قائم لم يتّخذ بشأنه إجراءً (موافقة/رفض/تفاوض)
    if (userId) {
      const { data: pending } = await serviceClient
        .from('publish_requests')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'quoted')
        .limit(1)
      if (pending && pending.length > 0) {
        return NextResponse.json({
          error: 'لديك عرض قائم بانتظار موافقتك. يُرجى اتخاذ إجراء بشأنه — بالموافقة أو الرفض أو طلب التفاوض — قبل تقديم طلب جديد.',
          code: 'PENDING_QUOTE',
        }, { status: 409 })
      }
    }

    const selectedExtras: string[] = Array.isArray(body.selected_extras) ? body.selected_extras : []
    const channels: string[]       = Array.isArray(body.channels) ? body.channels : []
    const scope = channels.length > 1 ? 'all' : 'single'
    const now   = new Date().toISOString()
    const quoteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const isCampaign = body.request_type === 'campaign'

    // ── تحقق من كود الخصم (إن وُجد) ─────────────────────────────
    let discountRow: any = null
    if (body.discount_code) {
      const { data: dc } = await serviceClient
        .from('discount_codes')
        .select('*')
        .eq('code', String(body.discount_code).trim().toUpperCase())
        .single()
      if (
        dc && dc.is_active &&
        new Date(dc.expires_at) > new Date() &&
        (dc.max_uses === null || dc.used_count < dc.max_uses)
      ) {
        discountRow = dc
        await serviceClient
          .from('discount_codes')
          .update({ used_count: dc.used_count + 1 })
          .eq('id', dc.id)
      }
    }

    // ── مسار الحملة ──────────────────────────────────────────────
    if (isCampaign) {
      const campaignPostsRaw: Array<{
        category: string
        sub_option: string | null
        title: string
        content: string
        preferred_date?: string | null
        images?: string[]
        link?: string | null
        hashtags?: string | null
      }> = Array.isArray(body.campaign_posts) ? body.campaign_posts : []

      if (campaignPostsRaw.length < 2) {
        return NextResponse.json({ error: 'الحملة تتطلب منشورين على الأقل' }, { status: 400 })
      }

      // احتساب سعر كل منشور
      const campaignCalc = calculateCampaignQuote(
        campaignPostsRaw.map(p => ({
          category:   p.category ?? '',
          subOption:  p.sub_option
            ? (() => {
                try {
                  const parsed = JSON.parse(p.sub_option!)
                  return typeof parsed === 'object' ? parsed : p.sub_option!
                } catch { return p.sub_option! }
              })()
            : null,
          clientType: body.client_type ?? 'individual',
        })),
        selectedExtras,
        CAMPAIGN_DISCOUNT_PCT,
        channels.length,
      )

      // تطبيق كود الخصم على إجمالي الحملة
      const campaignDiscountAmt = discountRow
        ? Math.round(campaignCalc.total * Number(discountRow.discount_pct) / 100)
        : 0
      const campaignFinalPrice = campaignCalc.total - campaignDiscountAmt

      // استخدم بيانات أول منشور لحقول title/content/category الإلزامية في الجدول
      const firstPost = campaignPostsRaw[0]

      const { data, error } = await serviceClient
        .from('publish_requests')
        .insert({
          user_id:          userId,
          influencer_id:    body.influencer_id,
          client_type:      body.client_type,
          org_name:           body.org_name ?? null,
          org_representative: body.org_representative ?? null,
          org_license:        body.org_license ?? null,

          // حقول إلزامية في الجدول — نملؤها ببيانات أول منشور
          category:         'campaign',
          title:            firstPost.title,
          content:          firstPost.content,
          scope,
          images:           'one',

          // حقول الحملة
          request_type:         'campaign',
          campaign_post_count:  campaignPostsRaw.length,
          campaign_duration:    body.campaign_duration ?? null,
          campaign_posts:       campaignPostsRaw,
          campaign_subtotal:    campaignCalc.postsSubtotal,
          campaign_discount_pct: CAMPAIGN_DISCOUNT_PCT,

          channels,
          extras:           selectedExtras,
          num_posts:        campaignPostsRaw.length,

          link:             firstPost.link ?? null,
          hashtags:         firstPost.hashtags ?? null,
          preferred_date:   firstPost.preferred_date ?? null,
          content_images:   Array.isArray(firstPost.images) ? firstPost.images : [],

          client_name:      body.client_name,
          client_phone:     body.client_phone,
          client_email:     body.client_email,
          client_city:      body.client_city,
          x_handle:         body.x_handle,

          // تسعير
          base_price:            campaignCalc.afterDiscount,
          extras_total:          campaignCalc.extrasTotal,
          vat_amount:            0,
          total_amount:          campaignCalc.total,
          admin_quoted_price:    campaignFinalPrice,
          admin_offered_extras:  [],
          user_selected_extras:  [],
          extras_selected_total: 0,
          final_total:           campaignFinalPrice,
          estimated_reach:       0,

          // كود الخصم
          discount_code:         discountRow ? discountRow.code : null,
          discount_code_id:      discountRow ? discountRow.id   : null,
          discount_pct:          discountRow ? Number(discountRow.discount_pct) : null,
          discount_amount:       campaignDiscountAmt > 0 ? campaignDiscountAmt : null,

          status:            'quoted',
          quoted_at:         now,
          last_status_change: now,
          quote_expires_at:  quoteExpiresAt,
          auto_quote_tier:   null,
          auto_quoted_at:    now,
          auto_quote_note:   `حملة ${campaignPostsRaw.length} منشورات — خصم ${CAMPAIGN_DISCOUNT_PCT}%`,
          updated_at:        now,
        })
        .select('request_number, id')
        .single()

      if (error) {
        console.error('Campaign insert error:', error)
        return NextResponse.json({ error: 'فشل حفظ الطلب' }, { status: 500 })
      }

      const requestNumber = generateRequestNumber(data.request_number)

      notifyNewRequestToAdmin({
        requestNumber,
        clientName:  body.client_name,
        clientEmail: body.client_email,
        clientPhone: body.client_phone,
        category:    `حملة (${campaignPostsRaw.length} منشورات)`,
        title:       `حملة: ${firstPost.title}`,
        content:     firstPost.content,
        channels,
      }).catch(e => console.error('Admin campaign email failed:', e))

      if (body.client_email) {
        notifyQuoteReadyToClient({
          email:                 body.client_email,
          requestNumber,
          clientName:            body.client_name ?? 'عزيزنا',
          price:                 campaignCalc.total,
          reach:                 0,
          quoteExpiresAt,
        }).catch(e => console.error('Campaign quote email failed:', e))
      }

      return NextResponse.json({ requestNumber, quotedTotal: campaignFinalPrice })
    }

    // ── مسار المنشور الواحد ───────────────────────────────────────
    const subOptionForCalc = body.sub_option &&
      typeof body.sub_option === 'object' &&
      'subcategory' in body.sub_option
        ? body.sub_option
        : (typeof body.sub_option === 'string' ? body.sub_option : null)

    // ── الباقة المختارة (للأفراد + المنشور الواحد فقط) ──────────────
    const selectedPackage: string | null = body.selected_package ?? null
    const pkg = selectedPackage
      ? PACKAGES.find(p => p.id === selectedPackage) ?? null
      : null

    // قنوات النشر الفعلية:
    //  - الاحتراف/التميز: كل قنوات الحساب المتاحة
    //  - الأساسية: القناة الواحدة التي اختارها المستخدم (basic_channel)
    let effectiveChannels = channels
    if (pkg?.allChannels) {
      const { data: inf } = await serviceClient
        .from('influencers')
        .select('*')
        .eq('id', body.influencer_id)
        .single()
      if (inf) {
        const allCh = [
          inf.x_followers  ? 'x'  : null,
          inf.ig_followers ? 'ig' : null,
          inf.li_followers ? 'li' : null,
          inf.tk_followers ? 'tk' : null,
        ].filter(Boolean) as string[]
        if (allCh.length > 0) effectiveChannels = allCh
      }
    } else if (pkg && !pkg.allChannels && body.basic_channel) {
      // الباقة الأساسية: قناة واحدة فقط يحددها المستخدم
      effectiveChannels = [body.basic_channel]
    }
    const effectiveScope = effectiveChannels.length > 1 ? 'all' : 'single'

    // الإضافات المضمَّنة في الباقة (مدمجة في السعر الثابت — لا تُضاف فوقه)
    const packageIncludedExtras: string[] = pkg ? pkg.includedExtras : []

    const priceCalc = calculateAutoQuote({
      category:       body.category ?? '',
      subOption:      subOptionForCalc,
      clientType:     body.client_type ?? 'individual',
      selectedExtras,
      channelCount:   effectiveChannels.length,
    })

    // سعر الباقة: basic = السعر الديناميكي، pro/elite = السعر الثابت
    const packagePrice = pkg
      ? (pkg.price != null ? pkg.price : priceCalc.total)
      : priceCalc.total

    // تطبيق كود الخصم على سعر الباقة النهائي
    const singleDiscountAmt = discountRow
      ? Math.round(packagePrice * Number(discountRow.discount_pct) / 100)
      : 0
    const singleFinalPrice = packagePrice - singleDiscountAmt

    // قيم التسعير المخزَّنة: basic يستخدم قيم التسعير التلقائي، pro/elite سعر ثابت بلا إضافات منفصلة
    const isFixedPackage = pkg != null && pkg.price != null
    const storedBasePrice   = isFixedPackage ? packagePrice : priceCalc.basePrice
    const storedExtrasTotal = isFixedPackage ? 0 : priceCalc.extrasTotal
    const storedTotalAmount = isFixedPackage ? packagePrice : priceCalc.total

    const { data, error } = await serviceClient
      .from('publish_requests')
      .insert({
        user_id:          userId,
        influencer_id:    body.influencer_id,
        client_type:      body.client_type,
        org_name:           body.org_name ?? null,
        org_representative: body.org_representative ?? null,
        org_license:        body.org_license ?? null,
        category:         body.category,
        sub_option:       body.sub_option
          ? (typeof body.sub_option === 'object'
              ? JSON.stringify(body.sub_option)
              : body.sub_option)
          : null,
        channels:         effectiveChannels,
        scope:            effectiveScope,
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

        request_type:     'single',

        base_price:            storedBasePrice,
        extras_total:          storedExtrasTotal,
        vat_amount:            priceCalc.vatAmount,
        total_amount:          storedTotalAmount,
        admin_quoted_price:    singleFinalPrice,
        admin_offered_extras:  [],
        user_selected_extras:  packageIncludedExtras,
        extras_selected_total: 0,
        final_total:           singleFinalPrice,
        estimated_reach:       0,

        // كود الخصم
        discount_code:    discountRow ? discountRow.code : null,
        discount_code_id: discountRow ? discountRow.id   : null,
        discount_pct:     discountRow ? Number(discountRow.discount_pct) : null,
        discount_amount:  singleDiscountAmt > 0 ? singleDiscountAmt : null,

        status:            'quoted',
        quoted_at:         now,
        last_status_change: now,
        quote_expires_at:  quoteExpiresAt,
        auto_quote_tier:   selectedPackage,
        auto_quoted_at:    now,
        auto_quote_note:   pkg
          ? `باقة: ${pkg.name} — فئة: ${body.category}`
          : `تسعير تلقائي — فئة: ${body.category}، إضافات: ${selectedExtras.length}`,
        updated_at:        now,
      })
      .select('request_number, id')
      .single()

    if (error) {
      console.error('Insert error:', error)
      return NextResponse.json({ error: 'فشل حفظ الطلب' }, { status: 500 })
    }

    const requestNumber = generateRequestNumber(data.request_number)

    const cat       = CATEGORIES.find(c => c.id === body.category)
    const catNameAr = cat?.nameAr ?? body.category

    notifyNewRequestToAdmin({
      requestNumber,
      clientName:  body.client_name,
      clientEmail: body.client_email,
      clientPhone: body.client_phone,
      category:    catNameAr,
      title:       body.title,
      content:     body.content,
      channels:    effectiveChannels,
    }).catch(e => console.error('Admin email failed:', e))

    if (body.client_email) {
      notifyQuoteReadyToClient({
        email:                 body.client_email,
        requestNumber,
        clientName:            body.client_name ?? 'عزيزنا',
        price:                 singleFinalPrice,
        reach:                 0,
        quoteExpiresAt,
      }).catch(e => console.error('Quote email failed:', e))
    }

    return NextResponse.json({ requestNumber, quotedTotal: singleFinalPrice })

  } catch (err) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
