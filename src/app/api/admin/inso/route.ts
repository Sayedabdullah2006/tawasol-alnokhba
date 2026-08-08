import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, chatComplete, STUDIO_EDITORIAL_DESIGN_RULES } from '@/lib/openai'
import { OPENAI_MODEL } from '@/lib/ai-studio'
import { generateImageWithOpenAI, imageGenerationErrorMessage } from '@/lib/image-generation'
import { compositeCampaignLogos, resizeToPoster } from '@/lib/logo-overlay'
import { completeGenerationJob, failGenerationJob, startGenerationJob, throwIfGenerationCancelled } from '@/lib/generation-jobs'
import { editDesign } from '@/lib/ai-studio'
import { cancelScheduledPost } from '@/lib/postpulse'
import { selectEditorialTemplate } from '@/lib/editorial-template-selector'
import {
  enforceInsoFooter,
  INSO_CAMPAIGN_KEY,
  INSO_CORE_CONTEXT,
  INSO_COVERAGE_SEEDS,
  type InsoCoverageSeed,
} from '@/lib/inso-2026'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Action = 'generate-copy' | 'generate-design-options' | 'generate-design-option' | 'select-design-option' | 'edit-design-option' | 'save' | 'add' | 'add-saved' | 'rewrite-saved' | 'delete-saved' | 'mark-published' | 'mark-scheduled' | 'cancel-scheduled'

const REAL_ARCHITECTURE_RULE = 'STRICT REAL-WORLD ARCHITECTURE RULE: never invent, redesign, exaggerate, or combine buildings, towers, skylines, landmarks, venues, or cityscapes. Do not use futuristic, imaginary, AI-looking, or generic foreign architecture. If a reference image contains a building, preserve it faithfully without changing its shape, height, facade, or surroundings. If no reference image is supplied, either use a clearly recognizable real Jeddah landmark only (Jeddah Corniche, King Fahd Fountain, Al-Balad heritage buildings, or an authentic Jeddah skyline) or omit buildings entirely and use science, people, sea, light, and abstract editorial elements instead. When accuracy is uncertain, omit the building rather than invent one.'

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
        content: 'أنت كاتب محتوى سعودي رصين للحسابات الرسمية. اكتب منشوراً عربياً واحداً موجزاً وجاهزاً للنشر بنبرة وطنية واثقة تبعث الفخر بالإنجاز، واستضافة المملكة، والشراكة بين موهبة ووزارة التعليم. اجعل الفخر نابعاً من الحقائق المتاحة لا من عبارات عامة أو مبالغة، ولا تخترع نتائج أو أسماء أو اقتباسات. اجعل اللغة حية وغير نمطية، واذكر موهبة ووزارة التعليم داخل السياق لا كإضافة شكلية. لا تضع أكثر من 2 إيموجي. استخدم نصاً عادياً فقط: ممنوع تماماً Markdown أو النجوم المفردة أو المزدوجة أو أي رموز للتغليظ.',
      },
      { role: 'user', content: itemBrief(item, extra) },
    ],
  })
  return enforceInsoFooter(completion.choices[0]?.message?.content ?? '')
}

async function generateInsoDesign(item: InsoCoverageSeed, postText: string, args: { note?: string; exactText?: string; direction: string; sourceImages?: string[]; hasVideo?: boolean; videoOrientation?: 'landscape' | 'portrait' }) {
  const service = await createServiceRoleClient()
  const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
  if (!brand?.first1saudi_logo_url) {
    throw new Error('اضبط شعار أول سعودي من إعدادات الهوية قبل توليد تصميم حملة INSO')
  }
  const templateDirective = await selectEditorialTemplate({
    sourceImageUrls: args.sourceImages ?? [],
    variantKey: `${item.coverage_date}:${item.slot}:${args.direction}:${args.note ?? ''}`,
  })
  const prompt = [
    'Create an editorial 4:5 social media poster for the International Nuclear Science Olympiad 2026 in Jeddah.',
    STUDIO_EDITORIAL_DESIGN_RULES,
    'Arabic-first premium scientific event design. Deep teal, bright turquoise and restrained gold accents; white may only be a small supporting detail, never a dominant field. Show science, global exchange, youth talent, and peaceful nuclear science through elegant visual metaphors; never show weapons, explosions, radiation danger signs, or fake logos.',
    REAL_ARCHITECTURE_RULE,
    `Event moment: ${item.title}. ${item.brief}`,
    `Source post facts to interpret visually: ${postText}. Do not copy or paste this caption into the design.`,
    `Creative direction: ${args.direction}.`,
    templateDirective,
    args.sourceImages?.length
      ? `Use all ${args.sourceImages.length} supplied reference images as intact documentary photographs in one creative composition. Do not redraw, restyle, replace, or synthesize people; retain each photo's real pose, clothing, and scene while designing the surrounding layout creatively.`
      : 'No reference image was supplied. Make Jeddah unmistakable and authentic through the Red Sea waterfront, people, event details, science, or a real verified landmark only. Never use a generic foreign city, invented tower, fictional venue, or imaginary cityscape.',
    args.hasVideo
      ? args.videoOrientation === 'portrait'
        ? 'This is a cover for a vertical 9:16 event video. On the 1080×1350 canvas reserve one large, empty 9:16 video window aligned to the right, around 56% of the canvas width and 85% of its height. It must be the dominant element, with a slim gold outline and subtle play icon only. Keep the window empty: no people, photos, words, numbers, or icons inside it. Build a clear Arabic RTL information column on the left, with all content and reference imagery arranged around the portrait video window. Never turn it into a horizontal frame.'
        : 'This is a cover for a horizontal 16:9 event video. On the 1080×1350 canvas reserve one large, empty 16:9 video window spanning almost the full width across the upper half. It must be the dominant element, with a slim gold outline and subtle play icon only. Keep the window empty: no people, photos, words, numbers, or icons inside it. Arrange the Arabic RTL title, facts, and reference imagery below or around it. Never turn it into a vertical frame.'
      : '',
    'Turn the facts into an original visual infographic hierarchy: use a concise Arabic headline only when it can be rendered accurately, then 2 to 4 short factual callouts, numbers, icons, data marks, or a small timeline. Never use long paragraphs, never repeat the full post caption, and never make the design look like a screenshot of a social post.',
    args.exactText?.trim() ? `Add this exact Arabic phrase in a small, readable line: "${args.exactText.trim()}". Copy every character exactly as supplied with correct connected RTL shaping. Do not invent, shorten, translate, spell-correct, or alter it.` : '',
    'Do not render event logos, brand logos, or hashtags. Add a compact social footer for First1Saudi with the official icons for X, Instagram, LinkedIn, Facebook, and TikTok, followed by the exact handle "@First1Saudi". All five icons are mandatory, equal in size, and must remain fully visible. Keep the artwork full-bleed to every edge. The original First1Saudi and Mawhiba lockups will be overlaid directly within the artwork at the extreme lower-right, approximately 300 by 130 pixels on the 1080 by 1350 canvas. Keep only text, people, numbers, and icons out of that small pocket while the exact same teal artwork and texture continue behind it. Never create a frame, box, panel, banner, border, blank area, or separate footer for the logos. The rest of the canvas must remain visually rich and balanced.',
    args.note?.trim() ? `Additional creative direction: ${args.note.trim()}` : '',
  ].filter(Boolean).join('\n\n')
  const safetyFallbackPrompt = [
    'Create a premium 4:5 Arabic editorial social poster for the International Nuclear Science Olympiad 2026 in Jeddah.',
    STUDIO_EDITORIAL_DESIGN_RULES,
    REAL_ARCHITECTURE_RULE,
    `Event moment and verified brief: ${item.title}. ${item.brief}`,
    `Interpret these source-post facts visually: ${postText.slice(0, 3500)}.`,
    `Mandatory creative direction: ${args.direction}.`,
    args.sourceImages?.length
      ? 'Use every supplied reference image as an intact documentary photograph. Integrate the photos creatively without redrawing, replacing, or restyling people.'
      : 'Use only authentic Jeddah context or abstract scientific elements. Omit any architecture whose authenticity is uncertain.',
    'Use one concise Arabic headline and 2 to 4 short factual callouts in strict right-to-left hierarchy. Do not copy the whole caption.',
    'Add a compact First1Saudi social footer with X, Instagram, LinkedIn, Facebook, and TikTok icons and the exact handle @First1Saudi. Do not draw logos or hashtags; they are overlaid after generation. Full-bleed artwork only, with no white panel or logo frame.',
    args.exactText?.trim() ? `Add this exact Arabic phrase exactly as written: "${args.exactText.trim()}".` : '',
    args.note?.trim() ? `Additional creative direction: ${args.note.trim()}` : '',
    'Avoid flags, weapons, radiation-danger symbols, danger imagery, explosions, political messaging, military content, invented buildings, and invented claims.',
  ].filter(Boolean).join('\n\n')
  const { b64 } = await generateImageWithOpenAI(prompt, args.sourceImages ?? [], { quality: 'high', safetyFallbackPrompt })
  const poster = await resizeToPoster(Buffer.from(b64, 'base64'))
  const response = await fetch(brand.first1saudi_logo_url)
  if (!response.ok) throw new Error('تعذّر تحميل شعار أول سعودي من إعدادات الهوية')
  const logos: Array<{ input: Buffer; widthRatio: number }> = [
    { input: Buffer.from(await response.arrayBuffer()), widthRatio: 0.075 },
  ]
  // The room uses the approved Mawhiba Arabic/English lockup, with its white lettering preserved.
  const mawhibaLogo = await readFile(path.join(process.cwd(), 'public', 'brands', 'mawhiba-inso-calligraphy.png'))
  logos.push({ input: mawhibaLogo, widthRatio: 0.145 })
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
    postText?: string; designNote?: string; exactText?: string; scheduledFor?: string; sourceImages?: string[]; hasVideo?: boolean; videoOrientation?: 'landscape' | 'portrait'; optionId?: string; optionIndex?: number; resetDesignOptions?: boolean;
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
            content: 'أنت محرر محتوى سعودي للحسابات الرسمية. أعد صياغة النص العربي بأسلوب رصين وحيوي ومختلف في كل مرة، بنبرة وطنية واثقة تبعث الفخر بالإنجاز وبالشراكة بين موهبة ووزارة التعليم. اجعل الفخر مبنياً على الحقائق فقط من دون مبالغة أو اختراع معلومات. اجعل النص جاهزاً للنشر، واذكر موهبة ووزارة التعليم داخل السياق. أخرج النص النهائي فقط بصيغة عادية بلا Markdown أو نجوم مفردة أو مزدوجة أو رموز للتغليظ.',
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
    generationJobId = body.action === 'generate-copy' || body.action === 'generate-design-options' || body.action === 'generate-design-option' || body.action === 'edit-design-option'
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

    if (body.action === 'generate-design-options' || body.action === 'generate-design-option') {
      const postText = enforceInsoFooter(body.postText ?? item.post_text ?? '')
      const sourceImages = Array.isArray(body.sourceImages)
        ? body.sourceImages.filter((url): url is string => typeof url === 'string' && url.startsWith('http')).slice(0, 5)
        : []
      if (!postText) {
        await failGenerationJob(generationJobId, new Error('ولّد أو اكتب نص المنشور أولاً'))
        return NextResponse.json({ error: 'ولّد أو اكتب نص المنشور أولاً' }, { status: 400 })
      }
      const directions = ['منظور علمي تحريري جريء', 'لقطة إنسانية دولية دافئة', 'تكوين بصري مستقبلي مستلهم من العلوم النووية السلمية']
      const optionIndex = Number.isInteger(body.optionIndex) ? Number(body.optionIndex) : 0
      if (optionIndex < 0 || optionIndex >= directions.length) {
        await failGenerationJob(generationJobId, new Error('خيار التصميم غير صالح'))
        return NextResponse.json({ error: 'خيار التصميم غير صالح' }, { status: 400 })
      }
      const directionsToGenerate = body.action === 'generate-design-options' ? directions : [directions[optionIndex]]
      const createdOptions = [] as Array<{ id: string; title: string; direction: string; imageUrl: string; hasVideo: boolean; videoOrientation?: 'landscape' | 'portrait'; selected: boolean; createdAt: string }>
      for (const direction of directionsToGenerate) {
        const index = directions.indexOf(direction)
        createdOptions.push({
          id: `${Date.now()}-${index}`,
          title: `الخيار ${index + 1}`,
          direction,
          imageUrl: await generateInsoDesign(item, postText, { direction, note: body.designNote, exactText: body.exactText, sourceImages, hasVideo: body.hasVideo, videoOrientation: body.videoOrientation }),
          hasVideo: Boolean(body.hasVideo),
          videoOrientation: body.hasVideo ? (body.videoOrientation ?? 'landscape') : undefined,
          selected: false,
          createdAt: new Date().toISOString(),
        })
      }
      await throwIfGenerationCancelled(generationJobId)
      const existingOptions = body.resetDesignOptions ? [] : (Array.isArray(item.design_options) ? item.design_options : [])
      const { data, error } = await service.from('event_coverage_items').update({
        post_text: postText, design_url: body.resetDesignOptions ? null : item.design_url, design_options: [...existingOptions, ...createdOptions], design_brief: body.designNote?.trim() || null,
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
      const sourceImages = Array.isArray(body.sourceImages)
        ? body.sourceImages.filter((url): url is string => typeof url === 'string' && url.startsWith('http')).slice(0, 5)
        : []
      const exactText = body.exactText?.trim() ?? ''
      if (optionIndex < 0 || (!body.designNote?.trim() && !exactText && !sourceImages.length)) return NextResponse.json({ error: 'اختر التصميم واكتب التعديل أو العبارة المطلوبة أو أرفق صورة بديلة' }, { status: 400 })
      const requestedNote = body.designNote?.trim() || (exactText ? 'أضف العبارة المحددة إلى التصميم.' : 'استبدل الصورة الرئيسية في التصميم بالصور المرجعية المرفقة، وادمجها بأسلوب تحريري متناسق.')
      const note = `${requestedNote}\n\n${REAL_ARCHITECTURE_RULE}`
      const editHistory = Array.isArray(options[optionIndex].editHistory)
        ? options[optionIndex].editHistory.filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0).slice(-8)
        : []
      const edited = await editDesign({ designImageUrl: options[optionIndex].imageUrl, note, exactText, referenceImageUrls: sourceImages, preserveEdits: editHistory })
      await throwIfGenerationCancelled(generationJobId)
      const nextOptions = options.map((entry: { id?: string }, index: number) => index === optionIndex ? { ...entry, imageUrl: edited.imageUrl, createdAt: new Date().toISOString(), editHistory: [...editHistory, note].slice(-8) } : entry)
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
      const options = Array.isArray(item.design_options) ? item.design_options : []
      const { data, error } = await service.from('event_coverage_items').update({
        publication_status: 'scheduled', scheduled_for: scheduledFor,
        design_options: options.map((option: { id?: string }) => ({ ...option, scheduledFor: option.id === body.optionId ? scheduledFor : undefined })),
        updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return NextResponse.json({ item: data })
    }

    if (body.action === 'cancel-scheduled') {
      if (item.publication_status !== 'scheduled' || !item.scheduled_for) {
        return NextResponse.json({ error: 'هذا المنشور ليس مجدولاً حالياً' }, { status: 400 })
      }

      const { data: schedules, error: schedulesError } = await service
        .from('postpulse_posts')
        .select('id, schedule_id, design_url')
        .eq('status', 'scheduled')
        .eq('content', item.post_text ?? '')
        .eq('scheduled_for', item.scheduled_for)
        .order('created_at', { ascending: false })
        .limit(10)
      if (schedulesError) throw schedulesError
      const schedule = (schedules ?? []).find(row => !item.design_url || row.design_url === item.design_url) ?? schedules?.[0]
      if (!schedule?.schedule_id) {
        return NextResponse.json({ error: 'تعذر العثور على معرّف الجدولة في PostPulse؛ لم يتم تغيير حالة المنشور.' }, { status: 409 })
      }

      await cancelScheduledPost(String(schedule.schedule_id))
      await service.from('postpulse_posts').update({ status: 'cancelled' }).eq('id', schedule.id)
      const options = Array.isArray(item.design_options) ? item.design_options : []
      const { data, error } = await service.from('event_coverage_items').update({
        publication_status: 'ready', scheduled_for: null,
        design_options: options.map((option: Record<string, unknown>) => {
          const nextOption = { ...option }
          delete nextOption.scheduledFor
          return nextOption
        }),
        updated_at: new Date().toISOString(),
      }).eq('id', item.id).select('*').single()
      if (error) throw error
      return NextResponse.json({ item: data })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (error) {
    const message = imageGenerationErrorMessage(error)
    await failGenerationJob(generationJobId, new Error(message))
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
