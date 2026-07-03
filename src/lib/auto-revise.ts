/**
 * إعادة التوليد التلقائي لتصاميم الطلب بناءً على ملاحظات العميل.
 *
 * يُستدعى «fire-and-forget» من مسارَي طلب التعديل (مفرد/حملة) بعد حفظ الملاحظة.
 * يأخذ التحليل المحفوظ + موجز كل تصميم + صور المصدر + ملاحظة العميل كـ note،
 * ويعيد توليد التصاميم مع **الإبقاء على القديمة**، ويخزّن المجموعة المعدّلة في
 * ai_revised_designs (مفرد) أو ai_posts[idx].revised (حملة). ثم يُشعر الأدمن.
 */
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI } from '@/lib/openai'
import { generateDesign } from '@/lib/ai-studio'
import { sendEmail } from '@/lib/email'

const ADMIN_EMAIL = 'first1saudi@gmail.com'
const SITE_URL = process.env.APP_BASE_URL || 'https://nukhba.media'

interface DesignEntry { title?: string; imageUrl?: string; url?: string; brief?: string }

function normalizeDesigns(v: unknown): DesignEntry[] {
  return (Array.isArray(v) ? v : [])
    .map((d: any) => ({ title: d?.title, imageUrl: d?.imageUrl ?? d?.url, brief: d?.brief }))
    .filter(d => d.imageUrl && !((d as any).revised)) // نعيد التوليد من الأصلية فقط
}

/** ينفّذ إعادة التوليد بالملاحظة. آمن للاستدعاء fire-and-forget. */
export async function autoReviseFromFeedback(args: { requestId: string; postIndex?: number | null; feedback: string }): Promise<void> {
  const { requestId } = args
  const feedback = (args.feedback || '').trim()
  if (!feedback) return
  const isPost = typeof args.postIndex === 'number' && args.postIndex >= 0
  const postIndex = args.postIndex as number

  const sc = await createServiceRoleClient()
  const { data: req } = await sc
    .from('publish_requests')
    .select('id, request_number, client_name, ai_analysis, ai_designs, ai_source_image, ai_uploaded_images, ai_posts')
    .eq('id', requestId)
    .single()
  if (!req) return

  // مصدر البيانات: حملة (ai_posts[idx]) أو مفرد (أعمدة الطلب)
  const entry: any = isPost && req.ai_posts && typeof req.ai_posts === 'object' ? (req.ai_posts as any)[postIndex] ?? {} : {}
  const analysis = isPost ? entry.analysis : req.ai_analysis
  const baseDesigns = normalizeDesigns(isPost ? entry.designs : req.ai_designs)
  const srcSingle = isPost ? entry.source_image : req.ai_source_image
  const uploaded = isPost ? entry.uploaded_images : req.ai_uploaded_images
  const sourceImages: string[] = [srcSingle, ...(Array.isArray(uploaded) ? uploaded : [])].filter(Boolean) as string[]

  // نحتاج تحليلاً + تصاميم أصلية + صورة مصدر لإعادة التوليد آلياً
  if (!analysis || !baseDesigns.length || !sourceImages.length) return

  try {
    const openai = getOpenAI()
    const revised: DesignEntry[] = []
    for (const d of baseDesigns) {
      const brief = d.brief || d.title || ''
      try {
        const { imageUrl } = await generateDesign(openai, {
          analysis,
          chosenConcept: brief,
          sourceImages,
          note: `تعديل بناءً على ملاحظات العميل: ${feedback}`,
        })
        revised.push({ title: `🔁 معدّل: ${d.title ?? 'تصميم'}`, imageUrl, brief })
      } catch { /* تجاهل فشل تصميم واحد */ }
    }
    if (!revised.length) return

    const payload = { feedback, at: new Date().toISOString(), designs: revised }
    if (isPost) {
      const aiPosts: Record<string, any> = req.ai_posts && typeof req.ai_posts === 'object' ? { ...(req.ai_posts as any) } : {}
      aiPosts[postIndex] = { ...(aiPosts[postIndex] ?? {}), revised: payload }
      await sc.from('publish_requests').update({ ai_posts: aiPosts }).eq('id', requestId)
    } else {
      await sc.from('publish_requests').update({ ai_revised_designs: payload }).eq('id', requestId)
    }

    const reqNumber = req.request_number ? `#${req.request_number}` : `#${requestId.slice(0, 8)}`
    const thumbs = revised.map(d => `<img src="${d.imageUrl}" style="width:110px;border-radius:8px;border:1px solid #e2e8f0;margin:4px" />`).join('')
    await sendEmail(ADMIN_EMAIL, `🔁 ملاحظات عميل + تصاميم معدّلة — الطلب ${reqNumber}`,
      `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f1f5f9;padding:24px">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:24px">
          <h2 style="color:#0A2D35;margin:0 0 8px">🔁 وصلت ملاحظات العميل وأُعيد توليد التصاميم — الطلب ${reqNumber}</h2>
          <p style="color:#475569;font-size:14px;margin:0 0 8px">العميل: ${(req.client_name as string) || 'عميل'}</p>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;color:#92400e;font-size:14px;margin:0 0 12px">✍️ ملاحظة العميل: ${feedback}</div>
          <p style="color:#475569;font-size:13px;margin:0 0 8px">أُنشئت ${revised.length} تصاميم معدّلة (مع الإبقاء على القديمة). راجعها في الاستوديو وأرسل الأنسب.</p>
          <div style="text-align:center">${thumbs}</div>
          <div style="text-align:center;margin-top:16px">
            <a href="${SITE_URL}/admin/requests/${requestId}" style="display:inline-block;background:#2D8B3F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">فتح الطلب في الاستوديو</a>
          </div>
        </div></body></html>`).catch(() => {})
  } catch (err) {
    console.error(`[AUTO_REVISE] فشل إعادة التوليد للطلب ${requestId}:`, err instanceof Error ? err.message : err)
  }
}
