import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { notifyAdminIntake, notifyRequestReceivedToClient } from '@/lib/email'
import { generateRequestNumber } from '@/lib/utils'
import { getInventorStoreProduct } from '@/lib/inventor-store'
import { formatInventorStoreAnswers, getInventorStoreOrderForm, validateInventorStoreAnswers } from '@/lib/inventor-store-order-forms'
import { normalizeImageUrls, normalizeSupportingDocuments } from '@/lib/request-attachments'

export async function POST(request: Request) {
  try {
    const auth = await createServerSupabaseClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'يلزم تسجيل الدخول لطلب الخدمة' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const product = getInventorStoreProduct(String(body.productSlug || ''))
    if (!product) return NextResponse.json({ error: 'الخدمة المختارة غير متاحة' }, { status: 400 })
    const definition = getInventorStoreOrderForm(product.slug)
    if (!definition) return NextResponse.json({ error: 'نموذج الخدمة غير متاح' }, { status: 400 })
    const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers as Record<string, unknown> : {}
    const validationError = validateInventorStoreAnswers(definition, answers)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
    const contentImages = normalizeImageUrls(body.images)
    if ((definition.images.minFiles || 0) > contentImages.length) return NextResponse.json({ error: `يلزم رفع ${definition.images.minFiles} صورة على الأقل لهذه الخدمة` }, { status: 400 })
    const projectTitle = String(answers[definition.titleField] || product.name).trim()

    const service = await createServiceRoleClient()
    const [{ data: profile }, { data: influencer }] = await Promise.all([
      service.from('profiles').select('full_name, phone, city, x_handle').eq('id', user.id).single(),
      service.from('influencers').select('id').eq('is_active', true).limit(1).maybeSingle(),
    ])
    const clientName = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'عميل'
    const clientPhone = profile?.phone || ''
    const clientEmail = user.email || ''
    if (!clientEmail) return NextResponse.json({ error: 'تعذّر قراءة البريد الإلكتروني من حسابك' }, { status: 400 })

    const content = [
      `الخدمة المطلوبة: ${product.name}`,
      `السعر المعلن: ${product.price} ر.س`,
      product.notice ? `تنبيه نطاق الخدمة: ${product.notice}` : null,
      formatInventorStoreAnswers(definition, answers),
    ].filter(Boolean).join('\n\n')
    const now = new Date().toISOString()
    const { data, error } = await service.from('publish_requests').insert({
      user_id: user.id,
      influencer_id: influencer?.id ?? null,
      client_type: 'individual',
      category: 'Others',
      sub_option: JSON.stringify({ source: 'inventor_store', product_slug: product.slug, product_name: product.name, listed_price: product.price }),
      channels: [], scope: 'single', images: 'one', extras: [], num_posts: 1,
      title: `${product.name} | ${projectTitle}`,
      content,
      preferred_date: body.preferredDate || null,
      content_images: contentImages,
      supporting_documents: normalizeSupportingDocuments(body.supportingDocuments),
      client_name: clientName, client_phone: clientPhone, client_email: clientEmail,
      client_city: profile?.city || null, x_handle: profile?.x_handle || null,
      request_type: 'single', base_price: product.price, extras_total: 0, vat_amount: 0, total_amount: product.price,
      billing_source: 'direct',
      admin_quoted_price: null, final_total: null, status: 'pending', quoted_at: null, quote_expires_at: null,
      auto_quote_tier: null, auto_quoted_at: null,
      auto_quote_note: `طلب من متجر مسار المخترع — ${product.name} — السعر المعلن ${product.price} ر.س`,
      last_status_change: now, updated_at: now,
    }).select('id, request_number').single()
    if (error || !data) {
      console.error('Inventor store order insert failed:', error)
      return NextResponse.json({ error: 'تعذّر حفظ طلب الخدمة' }, { status: 500 })
    }
    const requestNumber = generateRequestNumber(data.request_number)
    const emailData = { requestNumber, clientName, clientEmail, clientPhone, category: `مسار المخترع - ${product.name}`, title: projectTitle, content: String(answers[definition.sections[0]?.fields[1]?.key] || product.summary), channels: [], requestId: data.id }
    await Promise.allSettled([
      notifyAdminIntake({
        subject: 'طلب جديد من متجر مسار المخترع',
        heading: 'طلب خدمة جديد يحتاج مراجعة الإدارة',
        referenceNumber: requestNumber,
        referenceLabel: 'رقم الطلب',
        clientName,
        clientEmail,
        clientPhone,
        itemLabel: 'الخدمة',
        itemName: product.name,
        statusLabel: 'بانتظار مراجعة الإدارة وإرسال العرض',
        amount: product.price,
        actionLabel: 'فتح طلبات المتجر',
        actionUrl: 'https://nukhba.media/admin/inventor-store-requests',
      }),
      notifyRequestReceivedToClient(emailData),
    ])
    return NextResponse.json({ id: data.id, requestNumber })
  } catch (error) {
    console.error('Inventor store order failed:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إرسال الطلب' }, { status: 500 })
  }
}
