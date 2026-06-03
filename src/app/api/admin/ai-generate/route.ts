import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS, SYS_IMAGE } from '@/lib/openai'

export const dynamic = 'force-dynamic'
// Image generation can be slow — give it room.
export const maxDuration = 300

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
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  const { requestId, step, sourceImage, chosenConcept } = body
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

  const newsText = `العنوان: ${reqRow.title ?? ''}\nالمحتوى: ${reqRow.content ?? ''}`

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
        model: 'gpt-4o',
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

      const { error: upErr } = await service
        .from('publish_requests')
        .update({ ai_analysis: analysis, ai_source_image: sourceImage ?? null })
        .eq('id', requestId)
      if (upErr) throw new Error(upErr.message)

      return NextResponse.json({ analysis })
    }

    // ── STEP: tweets ───────────────────────────────────────────
    if (step === 'tweets') {
      if (!reqRow.ai_analysis) {
        return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 })
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYS_TWEETS },
          {
            role: 'user',
            content: `${JSON.stringify(reqRow.ai_analysis)}\n\n${newsText}`,
          },
        ],
      })

      const rawText = completion.choices[0]?.message?.content ?? ''
      const { error: upErr } = await service
        .from('publish_requests')
        .update({ ai_tweets: { raw: rawText } })
        .eq('id', requestId)
      if (upErr) throw new Error(upErr.message)

      return NextResponse.json({ tweets: rawText })
    }

    // ── STEP: concepts ─────────────────────────────────────────
    if (step === 'concepts') {
      if (!reqRow.ai_analysis) {
        return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 })
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYS_CONCEPTS },
          {
            role: 'user',
            content: `${JSON.stringify(reqRow.ai_analysis)}\n\n${newsText}`,
          },
        ],
      })

      const rawText = completion.choices[0]?.message?.content ?? ''
      const { error: upErr } = await service
        .from('publish_requests')
        .update({ ai_design_concepts: { raw: rawText } })
        .eq('id', requestId)
      if (upErr) throw new Error(upErr.message)

      return NextResponse.json({ concepts: rawText })
    }

    // ── STEP: image ────────────────────────────────────────────
    if (step === 'image') {
      if (!reqRow.ai_analysis) {
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
      await service
        .from('publish_requests')
        .update({ ai_chosen_concept: { text: chosenConcept } })
        .eq('id', requestId)

      // 1) Generate the detailed design prompt.
      const promptCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYS_IMAGE },
          {
            role: 'user',
            content:
              `بيانات الخبر (JSON):\n${JSON.stringify(reqRow.ai_analysis)}\n\n` +
              `الاتجاه المعتمد:\n${chosenConcept}\n\n` +
              `الصورة الحقيقية المرفقة هي على الرابط: ${sourceImage}\n` +
              (logoUrl
                ? `شعار First1Saudi متوفر على الرابط: ${logoUrl} — ضعه أسفل اليمين فوق منحنى الفوتر.\n`
                : `ضع شعار First1Saudi أسفل اليمين فوق منحنى الفوتر.\n`),
          },
        ],
      })

      const designPrompt = promptCompletion.choices[0]?.message?.content ?? ''

      await service
        .from('publish_requests')
        .update({ ai_image_prompt: designPrompt })
        .eq('id', requestId)

      // 2) Generate the actual image via gpt-image-1 images.edit.
      // The source image is the locked edit base. We pass only the source image
      // as the base for v1; the logo placement is described in the prompt text.
      // (Newer SDKs accept an array of images for images.edit; if multi-image
      // support is needed later, the logo File can be added to that array.)
      const srcResp = await fetch(sourceImage)
      if (!srcResp.ok) {
        throw new Error('تعذّر تحميل صورة المصدر')
      }
      const srcBuffer = Buffer.from(await srcResp.arrayBuffer())
      const sourceFile = await OpenAI.toFile(srcBuffer, 'source.png', { type: 'image/png' })

      const imageResult = await openai.images.edit({
        model: 'gpt-image-1',
        image: sourceFile,
        prompt: designPrompt,
        size: '1024x1536', // closest portrait to 4:5
      })

      const b64 = imageResult.data?.[0]?.b64_json
      if (!b64) {
        throw new Error('لم يُرجِع OpenAI صورة')
      }

      // 3) Decode and upload to the content-images bucket.
      const imageBuffer = Buffer.from(b64, 'base64')
      const path = `ai-${requestId}-${Date.now()}.png`
      const { error: uploadErr } = await service.storage
        .from('content-images')
        .upload(path, imageBuffer, { contentType: 'image/png' })
      if (uploadErr) throw new Error(`فشل رفع الصورة: ${uploadErr.message}`)

      const { data: pub } = service.storage.from('content-images').getPublicUrl(path)
      const imageUrl = pub.publicUrl

      // 4) Append to proposed_images and set ai_generated_at.
      const existing: string[] = Array.isArray(reqRow.proposed_images)
        ? reqRow.proposed_images
        : []
      const { error: finalErr } = await service
        .from('publish_requests')
        .update({
          proposed_images: [...existing, imageUrl],
          ai_generated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
      if (finalErr) throw new Error(finalErr.message)

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
