import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, chatComplete, SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS, buildConceptDirectives, buildTweetDirectives } from '@/lib/openai'
import { logGeneratedDesign } from '@/lib/newsletter'
import { generateImageWithOpenAI, imageGenerationErrorMessage } from '@/lib/image-generation'
import { buildCompactImagePrompt, buildStudioSafetyFallbackPrompt, prepareConceptImagePrompts } from '@/lib/ai-studio'
import { compositeLogoBottomRight, resizeToPoster } from '@/lib/logo-overlay'
import { completeGenerationJob, failGenerationJob, startGenerationJob, throwIfGenerationCancelled } from '@/lib/generation-jobs'
import { selectEditorialTemplate } from '@/lib/editorial-template-selector'

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
    sourceImages?: string[]
    extraInfo?: string
    chosenConcept?: string
    preparedPrompt?: string
    postIndex?: number
    note?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  const { requestId, step, sourceImage, chosenConcept, preparedPrompt, postIndex, note, extraInfo } = body
  if (!requestId || !step) {
    return NextResponse.json({ error: 'بيانات ناقصة (requestId/step)' }, { status: 400 })
  }

  // ── دعم اختيار أكثر من صورة مصدر تُضمَّن جميعها في التحليل والاتجاهات والتصميم ──
  // التوافق الخلفي: إن لم تُرسل sourceImages نستخدم sourceImage المفردة.
  const sourceImages: string[] =
    Array.isArray(body.sourceImages) && body.sourceImages.length
      ? body.sourceImages.filter((u): u is string => typeof u === 'string' && !!u)
      : sourceImage
        ? [sourceImage]
        : []
  const primarySource: string | null = sourceImages[0] ?? null
  // معلومات إضافية يدخلها الأدمن قبل التحليل (تُدمج مع نص الخبر).
  const extraInfoText =
    typeof extraInfo === 'string' && extraInfo.trim()
      ? `\n\nمعلومات إضافية من الأدمن (راعِها في التحليل والاتجاهات والتصميم):\n${extraInfo.trim()}`
      : ''

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
    if (typeof reqRow.client_name === 'string' && reqRow.client_name.trim()) {
      newsText += `\n\nاسم صاحب الإنجاز (معلومة موثقة من الطلب، استخدمه حرفياً في حقل name ولا تُسقطه): ${reqRow.client_name.trim()}`
    }
    priorAnalysis = reqRow.ai_posts?.[postIndex as number]?.analysis ?? null
  } else {
    newsText = `العنوان: ${reqRow.title ?? ''}\nالمحتوى: ${reqRow.content ?? ''}`
    priorAnalysis = reqRow.ai_analysis ?? null
  }
  // دمج المعلومات الإضافية (إن وُجدت) مع نص الخبر قبل أي خطوة.
  newsText += extraInfoText

  // ── سياق الحملة: نمرّر بقية المنشورات لمنع تكرار المعلومة أو الزاوية ──
  let campaignContext = ''
  if (isCampaignPost) {
    const posts = Array.isArray(reqRow.campaign_posts) ? reqRow.campaign_posts : []
    const otherPosts: Array<{ post: any; index: number }> = posts
      .map((post: any, index: number) => ({ post, index }))
      .filter((entry: { post: any; index: number }) => entry.index !== postIndex)
      .slice(0, 8)
    if (otherPosts.length) {
      campaignContext =
        'سياق الحملة — منشورات أخرى في نفس الحملة (للتنسيق فقط):\n' +
        otherPosts.map(({ post, index }) => `منشور ${index + 1}: العنوان: ${post.title ?? ''}\nالمحتوى: ${post.content ?? ''}`).join('\n\n') +
        '\n\nقاعدة إلزامية: ركّز على معلومة أو زاوية مختلفة تخص الخبر الحالي. لا تكرر العنوان أو الإنجاز أو الأرقام أو الافتتاحية المستخدمة في أي منشور آخر، إلا إذا كانت حقيقة تعريفية لا يمكن تجنبها.'
    }
  }

  const jobId = await startGenerationJob({ ownerId: user.id, scope: 'request', operation: step, targetId: requestId })
  const success = async (payload: Record<string, unknown>) => {
    await throwIfGenerationCancelled(jobId)
    await completeGenerationJob(jobId, payload)
    return NextResponse.json(payload)
  }
  const failure = async (message: string, status = 400) => {
    await failGenerationJob(jobId, new Error(message))
    return NextResponse.json({ error: message }, { status })
  }
  // يُدمج السياق قبل نص الخبر الحالي عند بناء رسائل المستخدم
  const withContext = (text: string) =>
    campaignContext ? `${campaignContext}\n\n──────\n\nالخبر الحالي:\n${text}` : text

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
    await throwIfGenerationCancelled(jobId)
    if (isCampaignPost) {
      const postKey = String(postIndex as number)
      const aiPosts: Record<string, Record<string, unknown>> =
        reqRow.ai_posts && typeof reqRow.ai_posts === 'object'
          ? { ...(reqRow.ai_posts as Record<string, Record<string, unknown>>) }
          : {}
      const entry: Record<string, unknown> = { ...(aiPosts[postKey] ?? {}) }
      if ('analysis' in patch) entry.analysis = patch.analysis
      if ('tweets' in patch) entry.tweets = patch.tweets
      if ('concepts' in patch) entry.design_concepts = patch.concepts
      if ('chosenConcept' in patch) entry.chosen_concept = patch.chosenConcept
      if ('imagePrompt' in patch) entry.image_prompt = patch.imagePrompt
      if ('sourceImage' in patch) entry.source_image = patch.sourceImage
      if ('generatedAt' in patch) entry.generated_at = patch.generatedAt
      if ('imageUrl' in patch) entry.image_url = patch.imageUrl
      aiPosts[postKey] = entry
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
    await failGenerationJob(jobId, new Error('مفتاح OpenAI غير مهيّأ'))
    return NextResponse.json(
      { error: 'مفتاح OpenAI غير مهيّأ — أضِفه في إعدادات الخادم' },
      { status: 500 }
    )
  }

  try {
    // ── STEP: analyze ──────────────────────────────────────────
    if (step === 'analyze') {
      const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: withContext(newsText) },
      ]
      // نمرّر جميع الصور المختارة ليُبنى التحليل على كل الصور لا صورة واحدة.
      for (const img of sourceImages) {
        userContent.push({ type: 'image_url', image_url: { url: img } })
      }

      const completion = await chatComplete(openai, {
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

      await saveStep({ analysis, sourceImage: primarySource })

      return success({ analysis })
    }

    // ── STEP: tweets ───────────────────────────────────────────
    if (step === 'tweets') {
      if (!priorAnalysis) {
        return failure('حلّل الخبر أولاً')
      }

      const completion = await chatComplete(openai, {
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYS_TWEETS },
          {
            role: 'user',
            content: `${JSON.stringify(priorAnalysis)}\n\n${withContext(newsText)}\n\n${buildTweetDirectives()}`,
          },
        ],
      })

      const rawText = completion.choices[0]?.message?.content ?? ''
      await saveStep({ tweets: { raw: rawText } })

      return success({ tweets: rawText })
    }

    // ── STEP: concepts ─────────────────────────────────────────
    if (step === 'concepts') {
      if (!priorAnalysis) {
        return failure('حلّل الخبر أولاً')
      }

      // استبعاد الاتجاهات المقترحة سابقاً لنفس الخبر (لإعادة توليد مختلفة)
      const prevConceptsSrc = isCampaignPost
        ? reqRow.ai_posts?.[postIndex as number]?.design_concepts
        : reqRow.ai_design_concepts
      const prevTitles: string[] = Array.isArray(prevConceptsSrc?.items)
        ? prevConceptsSrc.items.map((x: { title?: string }) => x?.title ?? '').filter(Boolean)
        : []
      // توجيهات التنويع: مجموعة عشوائية من عائلات الاتجاه + محاور التنويع + الاستبعاد
      const directives = buildConceptDirectives({ exclude: prevTitles })

      // نمرّر الصور المختارة ليُراعي الاتجاهات تكوينها ومزاجها،
      // فتتغيّر الاتجاهات وفق تحليل الخبر + صوره فعلاً لا قوالب ثابتة.
      const conceptUserContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: `${JSON.stringify(priorAnalysis)}\n\n${withContext(newsText)}\n\n${directives}` },
      ]
      // نمرّر جميع الصور المختارة لتُراعي الاتجاهات تكوين كل الصور ومزاجها.
      for (const img of sourceImages) {
        conceptUserContent.push({ type: 'image_url', image_url: { url: img } })
      }

      const completion = await chatComplete(openai, {
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYS_CONCEPTS },
          { role: 'user', content: conceptUserContent },
        ],
      })

      const rawText = completion.choices[0]?.message?.content ?? '{}'
      // نحاول استخراج مصفوفة الاتجاهات المنظّمة { concepts: [{title, mood, brief}] }
      let items: Array<{ title?: string; mood?: string; brief?: string }> = []
      try {
        const parsed = JSON.parse(rawText)
        if (Array.isArray(parsed?.concepts)) items = parsed.concepts
        else if (Array.isArray(parsed)) items = parsed
      } catch {
        items = []
      }

      items = await prepareConceptImagePrompts(openai, {
        analysis: priorAnalysis,
        concepts: items,
        sourceImageCount: sourceImages.length,
      })

      await saveStep({ concepts: { items, raw: rawText } })

      return success({ concepts: items, raw: rawText })
    }

    // ── STEP: image ────────────────────────────────────────────
    if (step === 'image') {
      if (!priorAnalysis) {
        return failure('حلّل الخبر أولاً')
      }
      if (!chosenConcept) {
        return failure('اختر اتجاه التصميم أولاً')
      }
      if (!sourceImages.length) {
        return failure('اختر صورة المصدر أولاً')
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

      const templateDirective = await selectEditorialTemplate({
        sourceImageUrls: sourceImages,
        variantKey: `${chosenConcept}:${note ?? ''}`,
      })
      // البرومبتات المحفوظة مع المفاهيم القديمة قد تحتوي أوامر تعديل حساسة على
      // الأشخاص. نستخدم الحقائق والاتجاه الحاليين فقط لبناء موجّه قصير وآمن.
      void preparedPrompt
      const designPrompt = buildCompactImagePrompt({
        analysis: priorAnalysis,
        chosenConcept: String(chosenConcept ?? ''),
        note,
        templateDirective,
      })

      await saveStep({ imagePrompt: designPrompt })

      // 2) توليد الصورة عبر OpenAI Images.
      // نمرّر الصورة الشخصية الحقيقية فقط كمرجع. لا نمرّر اللوقو إطلاقاً لأن
      // النموذج يُعيد رسمه ويُشوّه نصه العربي — سنُركّبه برمجياً بعد التوليد.
      const referenceImages = sourceImages
      // لا نفرض نسبة 4:5 على النموذج — فرضها يجعله يُعيد تكوين المشهد ويتجاهل الصورة الحقيقية.
      // المقاس النهائي يُضبط بـ sharp إلى 1080×1350 لاحقاً.
      const { b64 } = await generateImageWithOpenAI(designPrompt, referenceImages, {
        quality: 'high',
        safetyFallbackPrompt: buildStudioSafetyFallbackPrompt({ analysis: priorAnalysis, chosenConcept: String(chosenConcept ?? '') }),
      })

      // 3) ضبط المقاس إلى 1080×1350 بالضبط، ثم تركيب لوقو أول سعودي أسفل اليمين (إن وُجد).
      const rawImage = Buffer.from(b64, 'base64')
      const posterBase = await resizeToPoster(rawImage)
      const { buffer: finalImage, mimeType: finalMime } = logoUrl
        ? await compositeLogoBottomRight(posterBase, logoUrl)
        : { buffer: posterBase, mimeType: 'image/png' }

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
      await throwIfGenerationCancelled(jobId)
      const { error: appendErr } = await service
        .from('publish_requests')
        .update({ proposed_images: [...existing, imageUrl] })
        .eq('id', requestId)
      if (appendErr) throw new Error(appendErr.message)
      reqRow.proposed_images = [...existing, imageUrl]

      await saveStep({ generatedAt: new Date().toISOString(), imageUrl })

      // تسجيل التصميم في السجلّ الموحّد (مرشّحي نشرة «النخبة في ٧»)
      {
        const post = isCampaignPost ? (Array.isArray(reqRow.campaign_posts) ? reqRow.campaign_posts[postIndex as number] : null) : null
        await logGeneratedDesign({
          source: 'request',
          title: post?.title ?? reqRow.title ?? null,
          content: post?.content ?? reqRow.content ?? null,
          category: reqRow.category ?? null,
          imageUrl,
          sourceImageUrl: primarySource,
          requestId,
        })
      }

      return success({ imageUrl, prompt: designPrompt })
    }

    return failure('خطوة غير معروفة')
  } catch (err) {
    const message = imageGenerationErrorMessage(err)
    await failGenerationJob(jobId, new Error(message))
    return NextResponse.json(
      { error: `فشل توليد الذكاء الاصطناعي: ${message}` },
      { status: 500 }
    )
  }
}
