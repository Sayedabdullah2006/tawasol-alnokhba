import { PDFDocument } from 'pdf-lib'
import { readFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { generateImageWithOpenAI } from '@/lib/image-generation'
import { compositeCampaignLogos, compositeLogoBottomRight } from '@/lib/logo-overlay'
import { formatInsoDate, type InsoCoverageItem } from '@/lib/inso-2026'

const WIDTH = 1600
const HEIGHT = 900

export interface InsoReportChannel {
  platform: string
  label: string
}

interface ReportSlide {
  title: string
  content: string
  references?: string[]
}

function reportRules() {
  return [
    'Create one polished horizontal 16:9 campaign-report slide as a finished bitmap image, never a web page or a document.',
    'Brand: First1Saudi. Premium Saudi editorial design in deep teal, turquoise, restrained gold, and clean white details. Strong Arabic-first RTL hierarchy, elegant infographic composition, generous spacing, high-end presentation quality.',
    'Render every Arabic phrase quoted below accurately, connected, crisp and readable. Do not translate, paraphrase, omit, invent, or replace any quoted Arabic text or numeric fact.',
    'Add a subtle bottom footer containing the five social icons X, Instagram, LinkedIn, Facebook, TikTok and the exact handle @First1Saudi. Do not render any brand logo; original First1Saudi and Mawhiba logos will be composited after generation.',
    'Keep a compact lower-right logo-safe area with a continuous textured background, never a white panel or an empty box.',
  ].join('\n')
}

function reportText(item: InsoCoverageItem) {
  return (item.post_text ?? '').replace(/\s+/g, ' ').trim().slice(0, 280)
}

function statusLabel(item: InsoCoverageItem) {
  if (item.publication_status === 'published') return 'منشور'
  if (item.publication_status === 'scheduled') return 'مجدول'
  return 'جاهز للنشر'
}

async function createSlide(slide: ReportSlide, logoUrl: string | null, includeMawhibaLogo = false) {
  const prompt = [
    reportRules(),
    `SLIDE TITLE (render exactly): "${slide.title}"`,
    'SLIDE CONTENT (render and organize exactly, using concise labels, cards, timelines, and visual hierarchy appropriate to the content):',
    slide.content,
    slide.references?.length
      ? 'The attached images are approved campaign designs. Preserve each design recognizably and place it as a clean editorial thumbnail or card; do not alter their text, people, logos, or visual identity.'
      : '',
  ].filter(Boolean).join('\n\n')
  const { b64 } = await generateImageWithOpenAI(prompt, slide.references ?? [], {
    aspectRatio: '16:9', quality: 'medium', timeoutMs: 180_000, retries: 2,
  })
  const base = await sharp(Buffer.from(b64, 'base64')).resize(WIDTH, HEIGHT, { fit: 'cover' }).png().toBuffer()
  if (!logoUrl) return base
  if (!includeMawhibaLogo) return (await compositeLogoBottomRight(base, logoUrl, { widthRatio: 0.10 })).buffer
  try {
    const [first1Response, mawhibaLogo] = await Promise.all([
      fetch(logoUrl), readFile(path.join(process.cwd(), 'public', 'brands', 'mawhiba-colored-icon.svg')),
    ])
    if (!first1Response.ok) throw new Error('First1Saudi logo unavailable')
    return compositeCampaignLogos(base, [
      { input: Buffer.from(await first1Response.arrayBuffer()), widthRatio: 0.11 },
      { input: mawhibaLogo, widthRatio: 0.11 },
    ])
  } catch {
    return (await compositeLogoBottomRight(base, logoUrl, { widthRatio: 0.10 })).buffer
  }
}

export async function createInsoCampaignReport(args: {
  items: InsoCoverageItem[]
  logoUrl: string | null
  channels: InsoReportChannel[]
}) {
  const approved = args.items.filter(item => item.design_options?.some(option => option.selected))
  const published = args.items.filter(item => item.publication_status === 'published')
  const scheduled = args.items.filter(item => item.publication_status === 'scheduled')
  const saved = args.items.filter(item => item.post_text?.trim())
  const designOptions = args.items.reduce((sum, item) => sum + (item.design_options?.length ?? 0), 0)
  const days = [...new Set(args.items.map(item => item.coverage_date))]
  const slides: ReportSlide[] = [
    {
      title: 'تقرير أداء الحملة',
      content: 'أولمبياد العلوم النووية الدولي 2026\nغرفة عمليات التغطية\nجدة، المملكة العربية السعودية\nتقرير بصري موحد لحملة First1Saudi',
    },
    {
      title: 'ملخص التنفيذ',
      content: `منشورات محفوظة: ${saved.length}\nتصاميم معتمدة: ${approved.length}\nمنشورات منشورة: ${published.length}\nمنشورات مجدولة: ${scheduled.length}\nخيارات تصميم مولدة: ${designOptions}\nأيام التغطية: ${days.length}\nاعرض الأرقام في بطاقات بيانات بارزة، واكتب في أسفل الشريحة: "يعرض التقرير مؤشرات التنفيذ الفعلية فقط."`,
    },
    {
      title: 'الخط الزمني للحملة',
      content: days.map(date => {
        const items = args.items.filter(item => item.coverage_date === date)
        const approvedCount = items.filter(item => item.design_options?.some(option => option.selected)).length
        return `${formatInsoDate(date)}: ${items.length} محطات، ${approvedCount} تصاميم معتمدة`
      }).join('\n'),
    },
    {
      title: 'قنوات النشر',
      content: args.channels.length
        ? `القنوات المتصلة عبر Post-Pulse:\n${args.channels.map(channel => `• ${channel.label}`).join('\n')}\nاعرض القنوات كبطاقات واضحة، مع عبارة: "تُحدّث حالة القنوات عند إصدار التقرير."`
        : 'لا تتوفر بيانات اتصال القنوات حالياً.\nاعرض هذه العبارة بوضوح ضمن بطاقة حالة هادئة، دون اختلاق أي بيانات.',
    },
  ]

  for (let index = 0; index < approved.length; index += 3) {
    const group = approved.slice(index, index + 3)
    slides.push({
      title: `المحتوى المعتمد ${Math.floor(index / 3) + 1}`,
      content: group.map((item, itemIndex) => `${itemIndex + 1}. "${item.title}"\nالحالة: ${statusLabel(item)}\nالتغريدة: "${reportText(item)}"`).join('\n\n'),
      references: group.map(item => item.design_options.find(option => option.selected)?.imageUrl).filter((url): url is string => Boolean(url)),
    })
  }

  if (!approved.length) {
    slides.push({
      title: 'المحتوى المعتمد',
      content: 'لا توجد تصاميم معتمدة ضمن الحملة وقت إصدار التقرير.\nاعرض حالة هادئة مع دعوة لاعتماد أحد التصاميم المتاحة.',
    })
  }

  const pdf = await PDFDocument.create()
  for (const [index, slide] of slides.entries()) {
    const image = await createSlide(slide, args.logoUrl, index === 0)
    const page = pdf.addPage([WIDTH, HEIGHT])
    const embedded = await pdf.embedPng(image)
    page.drawImage(embedded, { x: 0, y: 0, width: WIDTH, height: HEIGHT })
  }
  return Buffer.from(await pdf.save())
}
