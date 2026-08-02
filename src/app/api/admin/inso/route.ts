import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, chatComplete } from '@/lib/openai'
import { OPENAI_MODEL } from '@/lib/ai-studio'
import { generateImageWithOpenAI } from '@/lib/image-generation'
import { compositeCampaignLogos, resizeToPoster } from '@/lib/logo-overlay'
import { completeGenerationJob, failGenerationJob, startGenerationJob, throwIfGenerationCancelled } from '@/lib/generation-jobs'
import {
  enforceInsoFooter,
  INSO_CAMPAIGN_KEY,
  INSO_CORE_CONTEXT,
  INSO_COVERAGE_SEEDS,
  type InsoCoverageSeed,
} from '@/lib/inso-2026'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Action = 'generate-copy' | 'generate-design' | 'save' | 'add' | 'mark-published' | 'mark-scheduled'

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
        content: 'أنت كاتب محتوى سعودي رصين للحسابات الرسمية. اكتب منشوراً عربياً واحداً موجزاً وجاهزاً للنشر. لا تخترع نتائج أو أسماء أو اقتباسات. اجعل اللغة حية وغير نمطية، واذكر موهبة ووزارة التعليم داخل السياق لا كإضافة شكلية. لا تضع أكثر من 2 إيموجي.',
      },
      { role: 'user', content: itemBrief(item, extra) },
    ],
  })
  return enforceInsoFooter(completion.choices[0]?.message?.content ?? '')
}

async function generateInsoDesign(item: InsoCoverageSeed, postText: string, note?: string) {
  const service = await createServiceRoleClient()
  const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
  if (!brand?.first1saudi_logo_url) {
    throw new Error('اضبط شعار أول سعودي من إعدادات الهوية قبل توليد تصميم حملة INSO')
  }
  const prompt = [
    'Create an editorial 4:5 social media poster for the International Nuclear Science Olympiad 2026 in Jeddah.',
    'Arabic-first premium scientific event design. Deep teal, bright turquoise, white and restrained gold accents. Show science, global exchange, youth talent, and peaceful nuclear science through elegant visual metaphors; never show weapons, explosions, radiation danger signs, or fake logos.',
    `Event moment: ${item.title}. ${item.brief}`,
    `Post theme: ${postText}`,
    'Do not render Arabic text, event logos, brand logos, account handles, or hashtags. Leave a clean, quiet footer strip in the lower-right area for two original logos to be composited after generation.',
    note?.trim() ? `Creative direction: ${note.trim()}` : '',
  ].filter(Boolean).join('\n\n')
  const { b64 } = await generateImageWithOpenAI(prompt, [])
  const poster = await resizeToPoster(Buffer.from(b64, 'base64'))
  const response = await fetch(brand.first1saudi_logo_url)
  if (!response.ok) throw new Error('تعذّر تحميل شعار أول سعودي من إعدادات الهوية')
  const logos: Array<{ input: Buffer; widthRatio: number }> = [
    { input: Buffer.from(await response.arrayBuffer()), widthRatio: 0.105 },
  ]
  const mawhibaLogo = await readFile(path.join(process.cwd(), 'public', 'brands', 'mawhiba-colored-icon.svg'))
  logos.push({ input: mawhibaLogo, widthRatio: 0.105 })
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
    postText?: string; designNote?: string; scheduledFor?: string;
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

    if (!body.id) return NextResponse.json({ error: 'معرّف المنشور مطلوب' }, { status: 400 })
    const { data: item, error: lookupError } = await service
      .from('event_coverage_items').select('*').eq('id', body.id).eq('campaign_key', INSO_CAMPAIGN_KEY).single()
    if (lookupError || !item) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })
    generationJobId = body.action === 'generate-copy' || body.action === 'generate-design'
      ? await startGenerationJob({ ownerId: auth.user.id, scope: 'inso', operation: body.action, targetId: item.id })
      : null
    const success = async (payload: Record<string, unknown>) => {
      await throwIfGenerationCancelled(generationJobId)
      await completeGenerationJob(generationJobId, payload)
      return NextResponse.json(payload)
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

    if (body.action === 'generate-design') {
      const postText = enforceInsoFooter(body.postText ?? item.post_text ?? '')
      if (!postText) {
        await failGenerationJob(generationJobId, new Error('ولّد أو اكتب نص المنشور أولاً'))
        return NextResponse.json({ error: 'ولّد أو اكتب نص المنشور أولاً' }, { status: 400 })
      }
      const designUrl = await generateInsoDesign(item, postText, body.designNote)
      await throwIfGenerationCancelled(generationJobId)
      const { data, error } = await service.from('event_coverage_items').update({
        post_text: postText, design_url: designUrl, design_brief: body.designNote?.trim() || null,
        publication_status: 'ready', updated_at: new Date().toISOString(),
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
