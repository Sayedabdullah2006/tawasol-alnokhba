/**
 * إعادة تعديل تلقائية لتصاميم الطلب بناءً على ملاحظات العميل.
 *
 * يُستدعى «fire-and-forget» من مسارَي طلب التعديل (مفرد/حملة) بعد حفظ الملاحظة.
 * يستخدم «التعديل الدقيق» (editDesign — image-to-image) على كل تصميم مُرسل فعلياً
 * للعميل، فيُطبَّق طلب العميل على **نفس التصميم/الصورة** دون إعادة التوليد الكامل
 * من معطيات الخبر. تُحفظ النتيجة في ai_revised_designs (مفرد) أو
 * ai_posts[idx].revised (حملة) مع الإبقاء على القديمة، ثم يُشعر الأدمن.
 */
import { createServiceRoleClient } from '@/lib/supabase-server'
import { editDesign } from '@/lib/ai-studio'
import { sendEmail } from '@/lib/email'
import { chatComplete, getOpenAI } from '@/lib/openai'
import { OPENAI_MODEL } from '@/lib/ai-studio'

const ADMIN_EMAIL = 'first1saudi@gmail.com'
const SITE_URL = process.env.APP_BASE_URL || 'https://nukhba.media'

interface DesignEntry { title?: string; imageUrl?: string; url?: string; brief?: string }

interface RevisionPlan { summary: string; textInstruction: string; designInstruction: string }

async function analyzeRevision(args: { textFeedback: string; designFeedback: string; originalContent: string }): Promise<RevisionPlan> {
  const fallback: RevisionPlan = {
    summary: [args.textFeedback && 'تعديل النص', args.designFeedback && 'تعديل التصميم المختار'].filter(Boolean).join('، ') || 'مراجعة العميل',
    textInstruction: args.textFeedback,
    designInstruction: args.designFeedback,
  }
  try {
    const completion = await chatComplete(getOpenAI(), {
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'أنت محلل ملاحظات مراجعة محتوى. افصل بدقة بين تعديل نص المنشور وتعديل التصميم. لا تخترع طلبات جديدة. أعد JSON فقط بالمفاتيح summary وtextInstruction وdesignInstruction.' },
        { role: 'user', content: JSON.stringify(args) },
      ],
    })
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Partial<RevisionPlan>
    return {
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary,
      textInstruction: typeof parsed.textInstruction === 'string' ? parsed.textInstruction.trim() : fallback.textInstruction,
      designInstruction: typeof parsed.designInstruction === 'string' ? parsed.designInstruction.trim() : fallback.designInstruction,
    }
  } catch { return fallback }
}

async function rewritePostCopy(originalContent: string, instruction: string): Promise<string> {
  if (!originalContent || !instruction) return originalContent
  try {
    const completion = await chatComplete(getOpenAI(), {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: 'أنت محرر محتوى عربي محترف. طبّق فقط تعديل العميل على النص. حافظ على الحقائق والأسماء والوسوم الصحيحة، وأعد النص النهائي فقط بلا شرح أو عناوين.' },
        { role: 'user', content: `النص الحالي:\n${originalContent}\n\nملاحظة العميل الخاصة بالنص:\n${instruction}` },
      ],
    })
    return completion.choices[0]?.message?.content?.trim() || originalContent
  } catch { return originalContent }
}

function normalizeDesigns(v: unknown): DesignEntry[] {
  return (Array.isArray(v) ? v : [])
    .map((d: any) => ({ title: d?.title, imageUrl: d?.imageUrl ?? d?.url, brief: d?.brief }))
    .filter(d => d.imageUrl && !((d as any).revised)) // نعدّل من الأصلية فقط
}

/** ينفّذ التعديل الدقيق بالملاحظة على كل تصميم مُرسل. آمن للاستدعاء fire-and-forget. */
export async function autoReviseFromFeedback(args: { requestId: string; postIndex?: number | null; feedback: string; textFeedback?: string; designFeedback?: string; selectedImage?: string | null; referenceImages?: string[] }): Promise<void> {
  const { requestId } = args
  const feedback = (args.feedback || '').trim()
  const referenceImages = Array.isArray(args.referenceImages) ? args.referenceImages.filter(Boolean).slice(0, 5) : []
  if (!feedback) return
  const isPost = typeof args.postIndex === 'number' && args.postIndex >= 0
  const postIndex = args.postIndex as number

  const sc = await createServiceRoleClient()
  const { data: req } = await sc
    .from('publish_requests')
    .select('id, request_number, client_name, ai_designs, ai_posts, post_reviews')
    .eq('id', requestId)
    .single()
  if (!req) return

  // مصدر التصاميم: آخر جولة مُرسلة فعلياً للعميل (post_reviews) وإلا مخرجات الاستوديو المحفوظة
  const reviews: Record<string, any> = req.post_reviews && typeof req.post_reviews === 'object' ? (req.post_reviews as any) : {}
  const sentImages: string[] | undefined = Array.isArray(reviews?.[postIndex ?? 0]?.proposed_images)
    ? reviews[postIndex ?? 0].proposed_images
    : undefined

  const entry: any = isPost && req.ai_posts && typeof req.ai_posts === 'object' ? (req.ai_posts as any)[postIndex] ?? {} : {}
  const studioDesigns = normalizeDesigns(isPost ? entry.designs : req.ai_designs)

  // نُفضّل التصاميم المُرسلة فعلياً (ما يراه العميل)؛ وإلا نستخدم مخرجات الاستوديو المحفوظة.
  const baseDesigns: DesignEntry[] = sentImages?.length
    ? sentImages.map((url, i) => ({ title: studioDesigns[i]?.title ?? `تصميم ${i + 1}`, imageUrl: url }))
    : studioDesigns

  const selectedDesigns = args.selectedImage && baseDesigns.some(design => design.imageUrl === args.selectedImage)
    ? baseDesigns.filter(design => design.imageUrl === args.selectedImage)
    : baseDesigns
  const originalContent = String(reviews?.[postIndex ?? 0]?.proposed_content ?? '')
  const plan = await analyzeRevision({
    textFeedback: (args.textFeedback ?? '').trim(),
    designFeedback: (args.designFeedback ?? feedback).trim(),
    originalContent,
  })
  const revisedText = plan.textInstruction ? await rewritePostCopy(originalContent, plan.textInstruction) : ''
  if (!selectedDesigns.length && !revisedText) return

  try {
    const revised: DesignEntry[] = []
    // تعديل التصميم المختار فقط؛ بقية الخيارات تبقى كما هي للمقارنة.
    for (const d of plan.designInstruction ? selectedDesigns : []) {
      try {
        const { imageUrl } = await editDesign({ designImageUrl: d.imageUrl as string, note: plan.designInstruction, referenceImageUrls: referenceImages })
        revised.push({ title: `🔁 معدّل: ${d.title ?? 'تصميم'}`, imageUrl })
      } catch { /* تجاهل فشل تصميم واحد */ }
    }
    const payload = {
      feedback, text_feedback: args.textFeedback ?? null, design_feedback: args.designFeedback ?? null,
      analysis: plan.summary, revised_text: revisedText || null, revision_base_image: args.selectedImage ?? null,
      reference_images: referenceImages, at: new Date().toISOString(), designs: revised,
    }
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
          <h2 style="color:#0A2D35;margin:0 0 8px">🔁 وصلت ملاحظات العميل وطُبِّق التعديل الدقيق — الطلب ${reqNumber}</h2>
          <p style="color:#475569;font-size:14px;margin:0 0 8px">العميل: ${(req.client_name as string) || 'عميل'}</p>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;color:#92400e;font-size:14px;margin:0 0 12px">✍️ ملاحظة العميل: ${feedback}</div>
          <p style="color:#475569;font-size:13px;margin:0 0 8px">طُبِّق التعديل على نفس التصاميم المُرسلة (${revised.length}) مع الإبقاء على القديمة. راجعها في الاستوديو وأرسل الأنسب.</p>
          <div style="text-align:center">${thumbs}</div>
          <div style="text-align:center;margin-top:16px">
            <a href="${SITE_URL}/admin/requests/${requestId}" style="display:inline-block;background:#2D8B3F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">فتح الطلب في الاستوديو</a>
          </div>
        </div></body></html>`).catch(() => {})
  } catch (err) {
    console.error(`[AUTO_REVISE] فشل إعادة التوليد للطلب ${requestId}:`, err instanceof Error ? err.message : err)
  }
}
