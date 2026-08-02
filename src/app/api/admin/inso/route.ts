import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, chatComplete, STUDIO_EDITORIAL_DESIGN_RULES } from '@/lib/openai'
import { OPENAI_MODEL } from '@/lib/ai-studio'
import { generateImageWithOpenAI } from '@/lib/image-generation'
import { compositeCampaignLogos, resizeToPoster } from '@/lib/logo-overlay'
import { completeGenerationJob, failGenerationJob, startGenerationJob, throwIfGenerationCancelled } from '@/lib/generation-jobs'
import { editDesign } from '@/lib/ai-studio'
import {
  enforceInsoFooter,
  INSO_CAMPAIGN_KEY,
  INSO_CORE_CONTEXT,
  INSO_COVERAGE_SEEDS,
  type InsoCoverageSeed,
} from '@/lib/inso-2026'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Action = 'generate-copy' | 'generate-design-options' | 'select-design-option' | 'edit-design-option' | 'save' | 'add' | 'add-saved' | 'rewrite-saved' | 'delete-saved' | 'mark-published' | 'mark-scheduled'

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 403 }) }
  return { supabase, user }
}

async function ensureInsoSeeded() {
  const service = await createServiceRoleClient()
  const rows = INSO_COVERAGE_SEEDS.map(seed => ({ ...seed, campaign_key: INSO_CAMPAIGN_KEY }))
  const { error } = await service
    .from('event_coverage_items')
    .upsert(rows, { onConflict: 'campaign_key,coverage_date,slot', ignoreDuplicates: true })
  if (error) throw new Error(`تعذّر تجهيز خطة INSO: ${error.message}`)
  return service
}

function itemBrief(item: InsoCoverageSeed, extra?: string) {
  return `${INSO_CORE_CONTEXT}\nالمحطة: ${item.title}\nالتاريخ: ${item.coverage_date}\nتفاصيل المحطة: ${item.brief}${extra?.trim() ? `\nتوجيه إضافي: ${extra.trim()}` : ''}`
}

async function generateInsoCopy(item: InsoCoverageSeed, extra?: string) {
  const openai = getOpenAI()
  const completion = await chatComplete(openai, {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'أنت كاتب محتوى سعودي رصين للحسابات الرسمية. اكتب منشوراً عربياً واحداً موجزاً وجاهزاً للنشر. لا تخترع نتائج أو أسماء أو اقتباسات. اجعل اللغة حية وغير نمطية، واذكر موهبة ووزارة التعليم داخل السياق لا كإضافة شكلية. لا تضع أكثر من 2 إيموجي. استخدم نصاً عادياً فقط: ممنوع تماماً Markdown أو النجوم المفردة أو المزدوجة أو أي رموز للتغليظ.',
      },
      { role: 'user', content: itemBrief(item, extra) },
    ],
  })
  return enforceInsoFooter(completion.choices[0]?.message?.content ?? '')
}

async function generateInsoDesign(item: InsoCoverageSeed, postText: string, args: { note?: string; direction: string; sourceImages?: string[]; hasVideo?: boolean }) {
  const service = await createServiceRoleClient()
  const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
  if (!brand?.first1saudi_logo_url) {
    throw new Error('اضبط شعار أول سعودي من إعدادات الهوية قبل توليد تصميم حملة INSO')
  }
  const prompt = [
    'Create an editorial 4:5 social media poster for the International Nuclear Science Olympiad 2026 in Jeddah.',
    STUDIO_EDITORIAL_DESIGN_RULES,
    'Arabic-first premium scientific event design. Deep teal, bright turquoise and restrained gold accents; white may only be a small supporting detail, never a dominant field. Show science, global exchange, youth talent, and peaceful nuclear science through elegant visual metaphors; never show weapons, explosions, radiation danger signs, or fake logos.',
    `Event moment: ${item.title}. ${item.brief}`,
    `Source post facts to interpret visually: ${postText}. Do not copy or paste this caption into the design.`,
    `Creative direction: ${args.direction}.`,
    args.sourceImages?.length
      ? `Use all ${args.sourceImages.length} supplied reference images as editorial visual sources and integrate them into one creative composition. Treat every depicted person as identity-critical: preserve their exact facial identity and features, skin tone, apparent age, body proportions, hairstyle, clothing, uniforms, accessories, and overall appearance. Do not beautify, restyle, swap, invent, alter, or regenerate their face, body, clothes, or identity. Do not turn the people into illustrations, avatars, or lookalikes. Keep them recognizably faithful while designing the surrounding composition creatively.`
      : 'No reference image was supplied. Make Jeddah unmistakable and authentic: use one relevant real-world cue such as the Jeddah Corniche and Red Sea waterfront, King Fahd Fountain, Al-Balad coral-stone architecture, or the Jeddah skyline. Never use a generic foreign city.',
    args.hasVideo ? 'This is the cover for a short event video. Build a dynamic visual opening frame with space for motion cues, while remaining a polished 4:5 static poster.' : '',
    'Turn the facts into an original visual infographic hierarchy: use a concise Arabic headline only when it can be rendered accurately, then 2 to 4 short factual callouts, numbers, icons, data marks, or a small timeline. Never use long paragraphs, never repeat the full post caption, and never make the design look like a screenshot of a social post.',
    'Do not render event logos, brand logos, or hashtags. Add a compact social footer for First1Saudi with the official icons for X, Instagram, LinkedIn, Facebook, and TikTok, followed by the exact handle "@First1Saudi". All five icons are mandatory, equal in size, and must remain fully visible. Keep the artwork full-bleed to every edge. Reserve ONLY a compact logo-safe zone at the extreme lower-right, approximately 240 by 120 pixels on the 1080 by 1350 canvas. Keep this tiny area free of text, people, numbers, icons, and high-detail imagery so two original logos can be overlaid without covering the design. It must be a subtle continuation of the surrounding teal artwork with a little texture or soft pattern, never a large dark void, empty field, panel, banner, footer, or boxed area. The rest of the canvas must remain visually rich and balanced.',
    args.note?.trim() ? `Additional creative direction: ${args.note.trim()}` : '',
  ].filter(Boolean).join('\n\n')
  const { b64 } = await generateImageWithOpenAI(prompt, args.sourceImages ?? [])
  const poster = await resizeToPoster(Buffer.from(b64, 'base64'))
  const response = await fetch(brand.first1saudi_logo_url)
  if (!response.ok) throw new Error('تعذّر تحميل شعار أول سعودي من إعدادات الهوية')
  const logos: Array<{ input: Buffer; widthRatio: number }> = [
    { input: Buffer.from(await response.arrayBuffer()), widthRatio: 0.09 },
  ]
  const mawhibaLogo = await readFile(path.join(process.cwd(), 'public', 'brands', 'mawhiba-colored-icon.svg'))
  logos.push({ input: mawhibaLogo, widthRatio: 0.09 })
  const finalImage = await compositeCampaignLogos(poster, logos)
  const imagePath = `inso-2026-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  const { error: uploadError } = await service.storage.from('content-images').upload(imagePath, finalImage, { contentType: 'image/png' })
  if (uploadError) throw new Error(`تعذّر حفظ التصميم: ${uploadError.message}`)
  return service.storage.from('content-images').getPublicUrl(imagePath).data.publicUrl
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  try {
    const service = await ensureInsoSeeded()
    const { data, error } = await service
      .from('event_coverage_items')
      .select('*')
      .eq('campaign_key', INSO_CAMPAIGN_KEY)
      .order('coverage_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر تحميل خطة INSO' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  let body: {
    action?: Action; id?: string; title?: string; brief?: string; coverageDate?: string; phase?: 'before' | 'during' | 'after';
    postText?: string; designNote?: string; scheduledFor?: string; sourceImages?: string[]; hasVideo?: boolean; optionId?: string;
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  if (!body.action) return NextResponse.json({ error: 'الإجراء مطلوب' }, { status: 400 })
  let generationJobId: string | null = null

  try {
    const service = await ensureInsoSeeded()
    if (body.action === 'add') {
      if (!body.title?.trim() || !body.brief?.trim() || !body.coverageDate || !body.phase) {
        return NextResponse.json({ error: 'أكمل عنوان المنشور ووصفه وتاريخه' }, { status: 400 })
      }
      const slot = `extra-${Date.now()}`
      const { data, error } = await service.from('event_coverage_items').insert({
        campaign_key: INSO_CAMPAIGN_KEY, coverage_date: body.coverageDate, phase: body.phase, slot,
        title: body.title.trim(), brief: body.brief.trim(),
      }).select('*').single()
      if (error) throw error
      return NextResponse.json({ item: data })
    }

    if (body.action === 'add-saved') {
      if (!body.title?.trim() || !body.postText?.trim() || !body.coverageDate || !body.phase) {
        return NextResponse.json({ error: 'أكمل عنوان المنشور ونصه وتاريخه' }, { status: 400 })
      }
      const { data, error } = await service.from('event_coverage_items').insert({
        campaign_key: INSO_CAMPAIGN_KEY,
        coverage_date: body.coverageDate,
        phase: body.phase,
        slot: `saved-${Date.now()}`,
        title: body.title.trim(),
        brief: 'منشور أضيف مباشرة إلى المحتوى المحفوظ.',
        post_text: enforceInsoFooter(body.postText),
        publication_status: 'ready',
      }).select('*').single()
      if (error) throw error
      return NextResponse.json({ item: data })
    }

    if (body.action === 'rewrite-saved') {
      if (!body.postText?.trim()) return NextResponse.json({ error: 'اكتب نص المنشور أولاً' }, { status: 400 })
      const openai = getOpenAI()
      const completion = await chatComplete(openai, {
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'أنت محرر محتوى سعودي للحسابات الرسمية. أعد صياغة النص العربي بأسلوب رصين وحيوي ومختلف في كل مرة، مع الحفاظ على الحقائق فقط وعدم اختراع معلومات. اجعل النص جاهزاً للنشر، واذكر موهبة ووزارة التعليم داخل السياق. أخرج النص النهائي فقط بصيغة عادية بلا Markdown أو نجوم مفردة أو مزدوجة أو رموز للتغليظ.',
          },
          { role: 'user', content: `${INSO_CORE_CONTEXT}\nعنوان المنشور: ${body.title?.trim() || 'منشور INSO'}\nالنص المراد إعادة صياغته:\n${body.postText.trim()}` },
        ],
      })
      const postText = enforceInsoFooter(completion.choices[0]?.message?.content ?? body.postText)
      if (!body.id) return NextResponse.json({ postText })
      const { data, error } = await service.from('event_coverage_items').update({
        post_text: postText, publication_status: 'ready', updated_at: new Date().toISOString(),
      }).eq('id', body.id).eq('campaign_key', INSO_CAMPAIGN_KEY).select('*').single()
      if (error) throw error
      return NextResponse.json({ item: data, postText })
    }

    if (!body.id) return NextResponse.json({ error: 'معرّف المنشور مطلوب' }, { status: 400 })
    const { data: item, error: lookupError } = await service
      .from('event_coverage_items').select('*').eq('id', body.id).eq('campaign_key', INSO_CAMPAIGN_KEY).single()
    if (lookupError || !item) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })
    generationJobId = body.action === 'generate-copy' || body.action === 'generate-design-options' || body.action === 'edit-design-option'
      ? await startGenerationJob({ ownerId: auth.user.id, scope: 'inso', operation: body.action, targetId: item.id })
      : null
    const success = async (payload: Record<string, unknown>) => {
      await throwIfGenerationCancelled(generationJobId)
      await completeGenerationJob(generationJobId, payload)
      return NextResponse.json(payload)
    }

    if (body.action === 'delete-saved') {
      if (item.slot.startsWith('saved-')) {
        const { error } = await service.from('event_coverage_items').delete().eq('id', item.id)
        if (error) throw error
        return success({ deletedId: item.id })
      }
      const { data, error } = await service.from('event_coverage_items').update({
        post_text: null, design_url: null, design_options: [], design_brief: null,
        publication_status: 'draft', scheduled_for: null, published_at: null, updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return success({ item: data })
    }

    if (body.action === 'save') {
      const postText = enforceInsoFooter(body.postText ?? '')
      const { data, error } = await service.from('event_coverage_items').update({
        post_text: postText, publication_status: postText ? 'ready' : 'draft', updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return success({ item: data })
    }

    if (body.action === 'generate-copy') {
      const text = await generateInsoCopy(item, body.designNote)
      await throwIfGenerationCancelled(generationJobId)
      const { data, error } = await service.from('event_coverage_items').update({
        post_text: text, publication_status: 'ready', updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return success({ item: data })
    }

    if (body.action === 'generate-design-options') {
      const postText = enforceInsoFooter(body.postText ?? item.post_text ?? '')
      const sourceImages = Array.isArray(body.sourceImages)
        ? body.sourceImages.filter((url): url is string => typeof url === 'string' && url.startsWith('http')).slice(0, 5)
        : []
      if (!postText) {
        await failGenerationJob(generationJobId, new Error('ولّد أو اكتب نص المنشور أولاً'))
        return NextResponse.json({ error: 'ولّد أو اكتب نص المنشور أولاً' }, { status: 400 })
      }
      const directions = ['منظور علمي تحريري جريء', 'لقطة إنسانية دولية دافئة', 'تكوين بصري مستقبلي مستلهم من العلوم النووية السلمية']
      const options = await Promise.all(directions.map(async (direction, index) => ({
        id: `${Date.now()}-${index}`,
        title: `الخيار ${index + 1}`,
        direction,
        imageUrl: await generateInsoDesign(item, postText, { direction, note: body.designNote, sourceImages, hasVideo: body.hasVideo }),
        hasVideo: Boolean(body.hasVideo),
        selected: false,
        createdAt: new Date().toISOString(),
      })))
      await throwIfGenerationCancelled(generationJobId)
      const { data, error } = await service.from('event_coverage_items').update({
        post_text: postText, design_url: null, design_options: options, design_brief: body.designNote?.trim() || null,
        publication_status: 'ready', updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return success({ item: data })
    }

    if (body.action === 'select-design-option') {
      const options = Array.isArray(item.design_options) ? item.design_options : []
      const option = options.find((entry: { id?: string }) => entry.id === body.optionId)
      if (!option?.imageUrl) return NextResponse.json({ error: 'خيار التصميم غير موجود' }, { status: 404 })
      const isAlreadySelected = Boolean(option.selected)
      const { data, error } = await service.from('event_coverage_items').update({
        design_url: isAlreadySelected ? null : option.imageUrl,
        design_options: options.map((entry: { id?: string }) => ({ ...entry, selected: isAlreadySelected ? false : entry.id === body.optionId })),
        updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return success({ item: data })
    }

    if (body.action === 'edit-design-option') {
      const options = Array.isArray(item.design_options) ? item.design_options : []
      const optionIndex = options.findIndex((entry: { id?: string }) => entry.id === body.optionId)
      if (optionIndex < 0 || !body.designNote?.trim()) return NextResponse.json({ error: 'اختر التصميم واكتب التعديل المطلوب' }, { status: 400 })
      const edited = await editDesign({ designImageUrl: options[optionIndex].imageUrl, note: body.designNote })
      await throwIfGenerationCancelled(generationJobId)
      const nextOptions = options.map((entry: { id?: string }, index: number) => index === optionIndex ? { ...entry, imageUrl: edited.imageUrl, createdAt: new Date().toISOString() } : entry)
      const { data, error } = await service.from('event_coverage_items').update({
        design_options: nextOptions, design_url: item.design_url === options[optionIndex].imageUrl ? edited.imageUrl : item.design_url,
        updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return success({ item: data })
    }

    if (body.action === 'mark-published') {
      const { data, error } = await service.from('event_coverage_items').update({
        publication_status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return NextResponse.json({ item: data })
    }

    if (body.action === 'mark-scheduled') {
      const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor).toISOString() : null
      const { data, error } = await service.from('event_coverage_items').update({
        publication_status: 'scheduled', scheduled_for: scheduledFor, updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return NextResponse.json({ item: data })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (error) {
    await failGenerationJob(generationJobId, error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء' }, { status: 500 })
  }
}
