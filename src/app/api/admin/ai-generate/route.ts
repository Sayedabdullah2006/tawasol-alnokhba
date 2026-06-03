import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS, SYS_IMAGE } from '@/lib/openai'
import { generateImageWithGemini } from '@/lib/gemini'
import { compositeLogoBottomRight } from '@/lib/logo-overlay'

export const dynamic = 'force-dynamic'
// Image generation can be slow — give it room.
export const maxDuration = 300

// موديل OpenAI النصّي المستخدم في الخطوات 1-3 + بناء برومبت التصميم
const OPENAI_MODEL = 'gpt-5.5'

type Step = 'analyze' | 'tweets' | 'concepts' | 'image'

export async function POST(req: Request) {
  // ── Admin auth ────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: {
    requestId?: string
    step?: Step
    sourceImage?: string
    chosenConcept?: string
    postIndex?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  const { requestId, step, sourceImage, chosenConcept, postIndex } = body
  if (!requestId || !step) {
    return NextResponse.json({ error: 'بيانات ناقصة (requestId/step)' }, { status: 400 })
  }

  const service = await createServiceRoleClient()

  // Load the request row
  const { data: reqRow, error: loadErr } = await service
    .from('publish_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (loadErr || !reqRow) {
    return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
  }

  // ── تحديد المصدر: منشور حملة محدّد أم الطلب المفرد ─────────────
  // عند تمرير postIndex نتعامل مع منشور بعينه من campaign_posts،
  // ونخزّن مخرجات الذكاء الاصطناعي داخل ai_posts[postIndex] بدل أعمدة الطلب.
  const isCampaignPost =
    typeof postIndex === 'number' && Number.isInteger(postIndex) && postIndex >= 0

  let newsText: string
  let priorAnalysis: unknown
  if (isCampaignPost) {
    const posts = Array.isArray(reqRow.campaign_posts) ? reqRow.campaign_posts : []
    const post = posts[postIndex as number]
    if (!post) {
      return NextResponse.json({ error: 'منشور الحملة غير موجود' }, { status: 404 })
    }
    newsText = `العنوان: ${post.title ?? ''}\nالمحتوى: ${post.content ?? ''}`
    priorAnalysis = reqRow.ai_posts?.[postIndex as number]?.analysis ?? null
  } else {
    newsText = `العنوان: ${reqRow.title ?? ''}\nالمحتوى: ${reqRow.content ?? ''}`
    priorAnalysis = reqRow.ai_analysis ?? null
  }

  // يحفظ مخرجات خطوة في الموضع الصحيح (أعمدة الطلب أو ai_posts[postIndex]).
  // يحافظ على نفس أشكال البيانات في الحالتين ليقرأها اللوح بنفس الطريقة.
  const saveStep = async (patch: {
    analysis?: unknown
    tweets?: unknown
    concepts?: unknown
    chosenConcept?: unknown
    imagePrompt?: string
    sourceImage?: string | null
    generatedAt?: string
    imageUrl?: string
  }) => {
    if (isCampaignPost) {
      const aiPosts: Record<string, any> =
        reqRow.ai_posts && typeof reqRow.ai_posts === 'object' ? { ...reqRow.ai_posts } : {}
      const entry: Record<string, any> = { ...(aiPosts[postIndex as number] ?? {}) }
      if ('analysis' in patch) entry.analysis = patch.analysis
      if ('tweets' in patch) entry.tweets = patch.tweets
      if ('concepts' in patch) entry.design_concepts = patch.concepts
      if ('chosenConcept' in patch) entry.chosen_concept = patch.chosenConcept
      if ('imagePrompt' in patch) entry.image_prompt = patch.imagePrompt
      if ('sourceImage' in patch) entry.source_image = patch.sourceImage
      if ('generatedAt' in patch) entry.generated_at = patch.generatedAt
      if ('imageUrl' in patch) entry.image_url = patch.imageUrl
      aiPosts[postIndex as number] = entry
      reqRow.ai_posts = aiPosts // إبقاء النسخة المحلية متزامنة
      const { error } = await service
        .from('publish_requests')
        .update({ ai_posts: aiPosts })
        .eq('id', requestId)
      if (error) throw new Error(error.message)
    } else {
      const upd: Record<string, unknown> = {}
      if ('analysis' in patch) upd.ai_analysis = patch.analysis
      if ('tweets' in patch) upd.ai_tweets = patch.tweets
      if ('concepts' in patch) upd.ai_design_concepts = patch.concepts
      if ('chosenConcept' in patch) upd.ai_chosen_concept = patch.chosenConcept
      if ('imagePrompt' in patch) upd.ai_image_prompt = patch.imagePrompt
      if ('sourceImage' in patch) upd.ai_source_image = patch.sourceImage
      if ('generatedAt' in patch) upd.ai_generated_at = patch.generatedAt
      if (Object.keys(upd).length) {
        const { error } = await service.from('publish_requests').update(upd).eq('id', requestId)
        if (error) throw new Error(error.message)
      }
    }
  }

  // Build the OpenAI client up front so a missing key returns a clear message.
  let openai: OpenAI
  try {
    openai = getOpenAI()
  } catch {
    return NextResponse.json(
      { error: 'مفتاح OpenAI غير مهيّأ — أضِفه في إعدادات الخادم' },
      { status: 500 }
    )
  }

  try {
    // ── STEP: analyze ──────────────────────────────────────────
    if (step === 'analyze') {
      const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: newsText },
      ]
      if (sourceImage) {
        userContent.push({ type: 'image_url', image_url: { url: sourceImage } })
      }

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYS_ANALYZE },
          { role: 'user', content: userContent },
        ],
      })

      const raw = completion.choices[0]?.message?.content ?? '{}'
      let analysis: unknown
      try {
        analysis = JSON.parse(raw)
      } catch {
        // Fallback: store the raw text if the model didn't return clean JSON.
        analysis = { raw }
      }

      await saveStep({ analysis, sourceImage: sourceImage ?? null })

      return NextResponse.json({ analysis })
    }

    // ── STEP: tweets ───────────────────────────────────────────
    if (step === 'tweets') {
      if (!priorAnalysis) {
        return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 })
      }

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYS_TWEETS },
          {
            role: 'user',
            content: `${JSON.stringify(priorAnalysis)}\n\n${newsText}`,
          },
        ],
      })

      const rawText = completion.choices[0]?.message?.content ?? ''
      await saveStep({ tweets: { raw: rawText } })

      return NextResponse.json({ tweets: rawText })
    }

    // ── STEP: concepts ─────────────────────────────────────────
    if (step === 'concepts') {
      if (!priorAnalysis) {
        return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 })
      }

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYS_CONCEPTS },
          {
            role: 'user',
            content: `${JSON.stringify(priorAnalysis)}\n\n${newsText}`,
          },
        ],
      })

      const rawText = completion.choices[0]?.message?.content ?? ''
      await saveStep({ concepts: { raw: rawText } })

      return NextResponse.json({ concepts: rawText })
    }

    // ── STEP: image ────────────────────────────────────────────
    if (step === 'image') {
      if (!priorAnalysis) {
        return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 })
      }
      if (!chosenConcept) {
        return NextResponse.json({ error: 'اختر اتجاه التصميم أولاً' }, { status: 400 })
      }
      if (!sourceImage) {
        return NextResponse.json({ error: 'اختر صورة المصدر أولاً' }, { status: 400 })
      }

      // Fetch the brand logo URL (if configured) so we can reference it in the prompt.
      const { data: brand } = await service
        .from('brand_settings')
        .select('first1saudi_logo_url')
        .eq('id', 1)
        .single()
      const logoUrl: string | null = brand?.first1saudi_logo_url ?? null

      // Persist the chosen concept immediately.
      await saveStep({ chosenConcept: { text: chosenConcept } })

      // 1) Generate the detailed design prompt.
      const promptCompletion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYS_IMAGE },
          {
            role: 'user',
            content:
              `بيانات الخبر (JSON):\n${JSON.stringify(priorAnalysis)}\n\n` +
              `الاتجاه المعتمد:\n${chosenConcept}\n\n` +
              `الصورة الحقيقية المرفقة هي على الرابط: ${sourceImage}\n` +
              // اللوقو يُركَّب برمجياً بعد التوليد — اطلب ترك مكانه فارغاً فقط.
              `اترك مساحة فارغة أسفل يمين الفوتر للوقو (سيُضاف لاحقاً برمجياً) ولا ترسم أي شعار هناك.\n`,
          },
        ],
      })

      const designPrompt = promptCompletion.choices[0]?.message?.content ?? ''

      await saveStep({ imagePrompt: designPrompt })

      // 2) توليد الصورة عبر Gemini (نموذج توليد الصور من Google).
      // نمرّر الصورة الشخصية الحقيقية فقط كمرجع. لا نمرّر اللوقو إطلاقاً لأن
      // النموذج يُعيد رسمه ويُشوّه نصه العربي — سنُركّبه برمجياً بعد التوليد.
      const referenceImages = [sourceImage]
      const { b64 } = await generateImageWithGemini(designPrompt, referenceImages)

      // 3) فكّ الترميز ثم تركيب لوقو أول سعودي أسفل اليمين (إن وُجد) بدقة بكسل.
      const rawImage = Buffer.from(b64, 'base64')
      const { buffer: finalImage, mimeType: finalMime } = logoUrl
        ? await compositeLogoBottomRight(rawImage, logoUrl)
        : { buffer: rawImage, mimeType: 'image/png' }

      const ext = finalMime.includes('jpeg') || finalMime.includes('jpg') ? 'jpg' : 'png'
      const suffix = isCampaignPost ? `-p${postIndex}` : ''
      const path = `ai-${requestId}${suffix}-${Date.now()}.${ext}`
      const { error: uploadErr } = await service.storage
        .from('content-images')
        .upload(path, finalImage, { contentType: finalMime })
      if (uploadErr) throw new Error(`فشل رفع الصورة: ${uploadErr.message}`)

      const { data: pub } = service.storage.from('content-images').getPublicUrl(path)
      const imageUrl = pub.publicUrl

      // 4) Append to proposed_images and record the per-post/image state.
      const existing: string[] = Array.isArray(reqRow.proposed_images)
        ? reqRow.proposed_images
        : []
      const { error: appendErr } = await service
        .from('publish_requests')
        .update({ proposed_images: [...existing, imageUrl] })
        .eq('id', requestId)
      if (appendErr) throw new Error(appendErr.message)
      reqRow.proposed_images = [...existing, imageUrl]

      await saveStep({ generatedAt: new Date().toISOString(), imageUrl })

      return NextResponse.json({ imageUrl, prompt: designPrompt })
    }

    return NextResponse.json({ error: 'خطوة غير معروفة' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطأ غير معروف'
    return NextResponse.json(
      { error: `فشل توليد الذكاء الاصطناعي: ${message}` },
      { status: 500 }
    )
  }
}
