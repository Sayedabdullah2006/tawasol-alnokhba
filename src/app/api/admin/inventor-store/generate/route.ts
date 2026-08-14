import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getInventorStoreProduct } from '@/lib/inventor-store'
import { getStudioForProduct, parseStoreRequestMeta } from '@/lib/inventor-store-studios'
import { getOpenAI, chatComplete } from '@/lib/openai'
import { OPENAI_MODEL } from '@/lib/ai-studio'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

async function requireAdmin() {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const service = await createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return profile?.role === 'admin' ? { service } : null
}

function extractJson(raw: string) {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned) as Record<string, unknown>
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const requestId = String(body.requestId || '')
    const deliverableKey = String(body.deliverableKey || '')
    const instruction = String(body.instruction || '').trim()

    const { data: publishRequest, error } = await auth.service
      .from('publish_requests')
      .select('id,title,content,content_images,supporting_documents,sub_option,client_name')
      .eq('id', requestId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const meta = parseStoreRequestMeta(publishRequest?.sub_option)
    if (!publishRequest || !meta) return NextResponse.json({ error: 'طلب المتجر غير موجود' }, { status: 404 })

    const product = getInventorStoreProduct(meta.product_slug)
    if (!product) return NextResponse.json({ error: 'الخدمة غير موجودة' }, { status: 404 })
    const studio = getStudioForProduct(product)
    const definition = studio.deliverables.find(item => item.key === deliverableKey)
    if (!definition) return NextResponse.json({ error: 'المخرج المطلوب غير موجود' }, { status: 404 })

    const outputShape = Object.fromEntries(definition.fields.map(field => [field.key, `${field.label}: نص عربي نهائي`]))
    const supportingDocuments = Array.isArray(publishRequest.supporting_documents)
      ? publishRequest.supporting_documents
      : []
    const prompt = [
      `الخدمة: ${product.name}`,
      `المخرج المطلوب: ${definition.title}`,
      `وصف المخرج: ${definition.description}`,
      product.notice ? `حدود الخدمة المعلنة: ${product.notice}` : '',
      `بيانات طلب العميل:\n${publishRequest.content || ''}`,
      `عدد الصور المرجعية: ${Array.isArray(publishRequest.content_images) ? publishRequest.content_images.length : 0}`,
      `عدد الوثائق الداعمة: ${supportingDocuments.length}`,
      instruction ? `توجيه الإدارة الإضافي: ${instruction}` : '',
      `أعد كائن JSON فقط بهذه المفاتيح دون أي مفتاح إضافي:\n${JSON.stringify(outputShape)}`,
    ].filter(Boolean).join('\n\n')

    const completion = await chatComplete(getOpenAI(), {
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'أنت خبير سعودي في إعداد مخرجات خدمات المخترعين. اكتب مسودة مهنية قابلة للتحرير بالعربية الفصحى الواضحة.',
            'استخدم حصراً المعلومات الواردة في الطلب. لا تخترع حقائق أو أرقاماً أو جهات أو نتائج بحث أو ادعاءات قانونية أو تجارية.',
            'إذا غابت معلومة لازمة، اكتب داخل الحقل: [مطلوب من العميل: وصف المعلومة] بدلاً من تخمينها.',
            'في الدراسات والبحث، افصل بوضوح بين ما ورد من العميل وما يحتاج تحققاً، ولا تدّع تنفيذ بحث خارجي.',
            'في المخرجات البصرية اكتب بنية المحتوى والتوجيه التحريري، ولا تضع أوصافاً نمطية تبدو مولدة آلياً.',
            'في جميع القوائم ضع كل بند في سطر مستقل. أخرج JSON صالحاً فقط.',
          ].join('\n'),
        },
        { role: 'user', content: prompt },
      ],
    }, { retries: 2, timeoutMs: 150_000 })

    const generated = extractJson(completion.choices[0]?.message?.content || '{}')
    const content = Object.fromEntries(definition.fields.map(field => [field.key, String(generated[field.key] ?? '')]))
    return NextResponse.json({ content })
  } catch (error) {
    console.error('Inventor store draft generation failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر توليد المسودة' }, { status: 500 })
  }
}
