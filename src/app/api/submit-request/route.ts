import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { generateRequestNumber } from '@/lib/utils'
import { notifyNewRequestToAdmin, notifyQuoteReadyToClient, notifyRequestReceivedToClient, notifyQuoteApprovedAwaitingPaymentToClient } from '@/lib/email'
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

    // الأفراد فقط يحصلون على تسعير تلقائي. الجهات (شركة/حكومة/خيرية/وكالة)
    // تذهب لحالة «بانتظار المراجعة» ليُسعّرها الأدمن يدوياً بعد مراجعة الخبر.
    const isIndividual = (body.client_type ?? 'individual') === 'individual'

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

      // ── باقة الحملة (للأفراد فقط) — باقة واحدة تنطبق على كل الأخبار ──
      const campaignSelectedPackage: string | null = isIndividual ? (body.selected_package ?? null) : null
      const campaignPkg = campaignSelectedPackage ? PACKAGES.find(p => p.id === campaignSelectedPackage) ?? null : null
      const isUpgradedCampaignPkg = campaignPkg != null && campaignPkg.id !== 'basic'

      // القنوات: الباقة الأساسية = قناة واحدة يحددها العميل ؛ غيرها = كل القنوات
      const campaignChannels = (campaignPkg && !campaignPkg.allChannels && body.basic_channel)
        ? [body.basic_channel as string]
        : channels
      const campaignScope = campaignChannels.length > 1 ? 'all' : 'single'

      // الأساس: مجموع الأخبار × معامل الباقة − خصم الحملة (مزايا الباقة المرقّاة مدمجة)
      let campaignBaseTotal: number
      let campaignExtrasTotal: number
      let campaignUserExtras: string[]
      if (campaignPkg) {
        const withPackage = Math.round(campaignCalc.postsSubtotal * campaignPkg.priceMultiplier)
        const afterDisc = withPackage - Math.round(withPackage * CAMPAIGN_DISCOUNT_PCT / 100)
        if (isUpgradedCampaignPkg) {
          campaignBaseTotal = afterDisc
          campaignExtrasTotal = 0
          campaignUserExtras = campaignPkg.includedExtras
        } else {
          campaignBaseTotal = afterDisc + campaignCalc.extrasTotal
          campaignExtrasTotal = campaignCalc.extrasTotal
          campaignUserExtras = selectedExtras
        }
      } else {
        campaignBaseTotal = campaignCalc.total
        campaignExtrasTotal = campaignCalc.extrasTotal
        campaignUserExtras = []
      }
      const campaignSubtotalDisplay = campaignPkg
        ? Math.round(campaignCalc.postsSubtotal * campaignPkg.priceMultiplier)
        : campaignCalc.postsSubtotal

      // تطبيق كود الخصم على الأساس بعد الباقة
      const campaignDiscountAmt = discountRow
        ? Math.round(campaignBaseTotal * Number(discountRow.discount_pct) / 100)
        : 0
      const campaignFinalPrice = campaignBaseTotal - campaignDiscountAmt

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
          scope:            campaignScope,
          images:           'one',

          // حقول الحملة
          request_type:         'campaign',
          campaign_post_count:  campaignPostsRaw.length,
          campaign_duration:    body.campaign_duration ?? null,
          campaign_posts:       campaignPostsRaw,
          campaign_subtotal:    campaignSubtotalDisplay,
          campaign_discount_pct: CAMPAIGN_DISCOUNT_PCT,

          channels:         campaignChannels,
          extras:           campaignUserExtras,
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

          // تسعير (admin_quoted_price / final_total تُضبط حسب نوع العميل بالأسفل)
          base_price:            campaignBaseTotal,
          extras_total:          campaignExtrasTotal,
          vat_amount:            0,
          total_amount:          campaignBaseTotal,
          admin_offered_extras:  [],
          user_selected_extras:  campaignUserExtras,
          extras_selected_total: 0,
          estimated_reach:       0,

          // كود الخصم
          discount_code:         discountRow ? discountRow.code : null,
          discount_code_id:      discountRow ? discountRow.id   : null,
          discount_pct:          discountRow ? Number(discountRow.discount_pct) : null,
          discount_amount:       isIndividual && campaignDiscountAmt > 0 ? campaignDiscountAmt : null,

          // الأفراد: الحملة معتمدة مباشرةً للدفع (بلا عرض/تفاوض). الجهات: تسعير يدوي.
          ...(isIndividual
            ? {
                admin_quoted_price: campaignFinalPrice,
                final_total:        campaignFinalPrice,
                status:             'approved',
                quoted_at:          now,
                approved_at:        now,
                auto_quoted_at:     now,
                auto_quote_note:    campaignPkg
                  ? `حملة ${campaignPostsRaw.length} منشورات — باقة: ${campaignPkg.name} — خصم ${CAMPAIGN_DISCOUNT_PCT}%`
                  : `حملة ${campaignPostsRaw.length} منشورات — خصم ${CAMPAIGN_DISCOUNT_PCT}%`,
              }
            : {
                admin_quoted_price: null,
                final_total:        null,
                status:             'pending',
                quoted_at:          null,
                quote_expires_at:   null,
                auto_quoted_at:     null,
                auto_quote_note:    `بانتظار تسعير الإدارة — حملة ${campaignPostsRaw.length} منشورات (نوع عميل: ${body.client_type})`,
              }),
          last_status_change: now,
          auto_quote_tier:   campaignSelectedPackage,
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
        if (isIndividual) {
          // الحملة معتمدة مباشرةً — بانتظار الدفع
          notifyQuoteApprovedAwaitingPaymentToClient({
            email:        body.client_email,
            requestNumber,
            clientName:   body.client_name ?? 'عزيزنا',
            total:        campaignFinalPrice,
          }).catch(e => console.error('Campaign awaiting-payment email failed:', e))
        } else {
          notifyRequestReceivedToClient({
            clientEmail: body.client_email,
            requestNumber,
            clientName:  body.client_name ?? 'عزيزنا',
            category:    `حملة (${campaignPostsRaw.length} منشورات)`,
            title:       firstPost.title,
            content:     firstPost.content,
            channels,
          }).catch(e => console.error('Campaign received email failed:', e))
        }
      }

      return NextResponse.json({
        requestNumber,
        id: data.id,
        quotedTotal: isIndividual ? campaignFinalPrice : null,
        readyForPayment: isIndividual,
      })
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

    // سعر الباقة = سعر الباقة الأساسية (الديناميكي حسب نوع الخبر) × معامل الباقة
    //  - الأساسية: المعامل 1.0  → السعر التلقائي للخبر
    //  - الاحتراف: ×1.46 ، التميز: ×1.60
    const packagePrice = pkg
      ? Math.round(priceCalc.total * pkg.priceMultiplier)
      : priceCalc.total

    // تطبيق كود الخصم على سعر الباقة النهائي
    const singleDiscountAmt = discountRow
      ? Math.round(packagePrice * Number(discountRow.discount_pct) / 100)
      : 0
    const singleFinalPrice = packagePrice - singleDiscountAmt

    // قيم التسعير المخزَّنة: باقات الاحتراف/التميز تُخزَّن بسعرها الكامل بلا إضافات منفصلة
    const isUpgradedPackage = pkg != null && pkg.id !== 'basic'
    const storedBasePrice   = isUpgradedPackage ? packagePrice : priceCalc.basePrice
    const storedExtrasTotal = isUpgradedPackage ? 0 : priceCalc.extrasTotal
    const storedTotalAmount = isUpgradedPackage ? packagePrice : priceCalc.total

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
        admin_offered_extras:  [],
        user_selected_extras:  packageIncludedExtras,
        extras_selected_total: 0,
        estimated_reach:       0,

        // كود الخصم
        discount_code:    discountRow ? discountRow.code : null,
        discount_code_id: discountRow ? discountRow.id   : null,
        discount_pct:     discountRow ? Number(discountRow.discount_pct) : null,
        discount_amount:  isIndividual && singleDiscountAmt > 0 ? singleDiscountAmt : null,

        // الأفراد: عرض تلقائي. الجهات: بانتظار تسعير الإدارة يدوياً.
        ...(isIndividual
          ? {
              admin_quoted_price: singleFinalPrice,
              final_total:        singleFinalPrice,
              status:             'quoted',
              quoted_at:          now,
              quote_expires_at:   quoteExpiresAt,
              auto_quote_tier:    selectedPackage,
              auto_quoted_at:     now,
              auto_quote_note:    pkg
                ? `باقة: ${pkg.name} — فئة: ${body.category}`
                : `تسعير تلقائي — فئة: ${body.category}، إضافات: ${selectedExtras.length}`,
            }
          : {
              admin_quoted_price: null,
              final_total:        null,
              status:             'pending',
              quoted_at:          null,
              quote_expires_at:   null,
              auto_quote_tier:    null,
              auto_quoted_at:     null,
              auto_quote_note:    `بانتظار تسعير الإدارة — فئة: ${body.category} (نوع عميل: ${body.client_type})`,
            }),
        last_status_change: now,
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
      if (isIndividual) {
        notifyQuoteReadyToClient({
          email:                 body.client_email,
          requestNumber,
          clientName:            body.client_name ?? 'عزيزنا',
          price:                 singleFinalPrice,
          reach:                 0,
          quoteExpiresAt,
        }).catch(e => console.error('Quote email failed:', e))
      } else {
        notifyRequestReceivedToClient({
          clientEmail: body.client_email,
          requestNumber,
          clientName:  body.client_name ?? 'عزيزنا',
          category:    catNameAr,
          title:       body.title,
          content:     body.content,
          channels:    effectiveChannels,
        }).catch(e => console.error('Received email failed:', e))
      }
    }

    return NextResponse.json({ requestNumber, quotedTotal: isIndividual ? singleFinalPrice : null })

  } catch (err) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
