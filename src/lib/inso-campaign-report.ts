import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { formatInsoDate, type InsoCoverageItem } from '@/lib/inso-2026'

const WIDTH = 1600
const HEIGHT = 900
const NAVY = '#0E2855'
const TEAL = '#087B78'
const GOLD = '#C9A961'
const CREAM = '#F7F4ED'

export interface InsoReportChannel {
  platform: string
  label: string
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char)
}

function lines(value: string, max = 54, limit = 5) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ')
  const out: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > max && line) {
      out.push(line)
      line = word
      if (out.length === limit) break
    } else line = candidate
  }
  if (line && out.length < limit) out.push(line)
  if (words.join(' ').length > out.join(' ').length) out[out.length - 1] = `${out[out.length - 1]}...`
  return out
}

function textBlock(value: string, x: number, y: number, options: { size?: number; fill?: string; weight?: number; max?: number; limit?: number; anchor?: string } = {}) {
  const { size = 28, fill = NAVY, weight = 400, max = 54, limit = 5, anchor = 'end' } = options
  return lines(value, max, limit).map((line, index) => `<text x="${x}" y="${y + index * (size + 13)}" text-anchor="${anchor}" direction="rtl" unicode-bidi="plaintext" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`).join('')
}

function footer(page: number) {
  return `<line x1="70" y1="836" x2="1530" y2="836" stroke="#D8E5E2" />
    <text x="80" y="870" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${NAVY}">X   Instagram   LinkedIn   Facebook   TikTok   @First1Saudi</text>
    <text x="1520" y="870" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="19" fill="#63718B">تقرير حملة INSO 2026  |  ${page}</text>`
}

async function render(svgBody: string) {
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${svgBody}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

function template(title: string, eyebrow: string, content: string, page: number) {
  return `<rect width="${WIDTH}" height="${HEIGHT}" fill="${CREAM}" />
    <rect x="0" y="0" width="28" height="${HEIGHT}" fill="${TEAL}" />
    <rect x="70" y="58" width="90" height="8" rx="4" fill="${GOLD}" />
    <text x="1520" y="98" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="${TEAL}">${escapeXml(eyebrow)}</text>
    <text x="1520" y="158" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="${NAVY}">${escapeXml(title)}</text>
    ${content}${footer(page)}`
}

async function fetchImageData(url: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const mime = response.headers.get('content-type') || 'image/png'
    return `data:${mime};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

function summaryCard(x: number, title: string, value: number, accent: string) {
  return `<rect x="${x}" y="250" width="300" height="180" rx="18" fill="#FFFFFF" stroke="#D8E5E2" stroke-width="2" />
    <rect x="${x}" y="250" width="300" height="10" rx="5" fill="${accent}" />
    <text x="${x + 270}" y="320" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#63718B">${escapeXml(title)}</text>
    <text x="${x + 270}" y="390" text-anchor="end" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="${NAVY}">${value}</text>`
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
  const logo = args.logoUrl ? await fetchImageData(args.logoUrl) : null
  const pages: Buffer[] = []

  pages.push(await render(`<rect width="${WIDTH}" height="${HEIGHT}" fill="${NAVY}" />
    <path d="M0 650 C360 520 660 760 1030 600 C1260 500 1410 350 1600 390 L1600 900 L0 900Z" fill="${TEAL}" />
    <path d="M0 710 C420 610 760 845 1180 675 C1350 606 1470 568 1600 590" fill="none" stroke="${GOLD}" stroke-width="10" />
    ${logo ? `<image href="${logo}" x="1290" y="70" width="210" height="150" preserveAspectRatio="xMaxYMid meet" />` : '<text x="1500" y="140" text-anchor="end" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF">First1Saudi</text>'}
    <text x="1500" y="350" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${GOLD}">تقرير أداء الحملة</text>
    <text x="1500" y="445" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF">أولمبياد العلوم النووية الدولي 2026</text>
    <text x="1500" y="515" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="32" fill="#D8E5E2">غرفة عمليات التغطية - جدة</text>
    <text x="100" y="835" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF">X   Instagram   LinkedIn   Facebook   TikTok   @First1Saudi</text>
    <text x="1500" y="835" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="21" fill="#D8E5E2">صدر في ${escapeXml(new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long', timeZone: 'Asia/Riyadh', calendar: 'gregory' }).format(new Date()))}</text>`))

  pages.push(await render(template('ملخص التنفيذ', 'المؤشرات الحالية للحملة',
    `${summaryCard(120, 'منشورات محفوظة', saved.length, TEAL)}${summaryCard(460, 'تصاميم معتمدة', approved.length, GOLD)}${summaryCard(800, 'منشور', published.length, '#24966A')}${summaryCard(1140, 'مجدول', scheduled.length, '#476AA3')}
     <rect x="120" y="490" width="1360" height="250" rx="18" fill="#FFFFFF" stroke="#D8E5E2" stroke-width="2" />
     ${textBlock(`تغطي الحملة ${days.length} يوماً، وقد نتج عنها ${designOptions} خيارات تصميمية. يعرض هذا التقرير مؤشرات التنفيذ المعتمدة وحالة النشر الفعلية دون إضافة أرقام تفاعل غير متاحة.`, 1420, 565, { size: 31, weight: 400, max: 78, limit: 3 })}`,
  2)))

  const timeline = days.map((date, index) => {
    const dateItems = args.items.filter(item => item.coverage_date === date)
    const approvedCount = dateItems.filter(item => item.design_options?.some(option => option.selected)).length
    const x = 1120 - (index % 5) * 250
    const y = 255 + Math.floor(index / 5) * 215
    return `<rect x="${x}" y="${y}" width="210" height="155" rx="16" fill="#FFFFFF" stroke="#D8E5E2" stroke-width="2" />
      <circle cx="${x + 34}" cy="${y + 34}" r="12" fill="${approvedCount ? TEAL : GOLD}" />
      ${textBlock(formatInsoDate(date), x + 185, y + 56, { size: 20, weight: 700, max: 18, limit: 2 })}
      <text x="${x + 185}" y="${y + 123}" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="19" fill="#63718B">${dateItems.length} محطات | ${approvedCount} معتمدة</text>`
  }).join('')
  pages.push(await render(template('خط زمني للحملة', 'التغطية مرتبة حسب الأيام', timeline, 3)))

  const channels = args.channels.length ? args.channels : [{ platform: '', label: 'لا تتوفر بيانات اتصال القنوات حالياً' }]
  const channelCards = channels.slice(0, 6).map((channel, index) => {
    const x = 250 + (index % 3) * 430
    const y = 280 + Math.floor(index / 3) * 220
    return `<rect x="${x}" y="${y}" width="350" height="150" rx="18" fill="#FFFFFF" stroke="#D8E5E2" stroke-width="2" />
      <circle cx="${x + 58}" cy="${y + 74}" r="32" fill="${index % 2 ? GOLD : TEAL}" />
      <text x="${x + 300}" y="${y + 70}" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="29" font-weight="700" fill="${NAVY}">${escapeXml(channel.label)}</text>
      <text x="${x + 300}" y="${y + 112}" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="20" fill="#24966A">متصل للنشر عبر Post-Pulse</text>`
  }).join('')
  pages.push(await render(template('قنوات النشر', 'الحسابات المتصلة للحملة', `${channelCards}${textBlock('يعكس التقرير حالة القنوات المتصلة وقت إنشاء الملف. لا تُعرض مؤشرات الوصول والتفاعل إلا عند توفرها من مصدر النشر.', 1480, 735, { size: 24, fill: '#63718B', max: 95, limit: 2 })}`, 4)))

  for (let index = 0; index < approved.length; index++) {
    const item = approved[index]
    const selected = item.design_options.find(option => option.selected)
    const image = selected?.imageUrl ? await fetchImageData(selected.imageUrl) : null
    const status = item.publication_status === 'published' ? 'منشور' : item.publication_status === 'scheduled' ? 'مجدول' : 'جاهز للنشر'
    const content = `<rect x="1040" y="235" width="390" height="490" rx="20" fill="#FFFFFF" stroke="#D8E5E2" stroke-width="2" />
      ${image ? `<image href="${image}" x="1058" y="253" width="354" height="454" preserveAspectRatio="xMidYMid slice" />` : `<rect x="1058" y="253" width="354" height="454" fill="#D8E5E2" />`}
      <rect x="120" y="235" width="830" height="490" rx="20" fill="#FFFFFF" stroke="#D8E5E2" stroke-width="2" />
      <rect x="120" y="235" width="830" height="13" rx="6" fill="${TEAL}" />
      ${textBlock(item.title, 900, 320, { size: 39, weight: 700, max: 38, limit: 2 })}
      <rect x="730" y="380" width="170" height="42" rx="21" fill="#E7F7F4" />
      <text x="815" y="409" text-anchor="middle" direction="rtl" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${TEAL}">${status}</text>
      ${textBlock(item.post_text ?? '', 900, 485, { size: 25, fill: '#33415C', max: 58, limit: 6 })}
      <text x="900" y="686" text-anchor="end" direction="rtl" font-family="Arial, sans-serif" font-size="19" fill="#63718B">${item.scheduled_for ? `موعد النشر: ${formatInsoDate(item.scheduled_for.slice(0, 10))}` : `محطة الحملة: ${formatInsoDate(item.coverage_date)}`}</text>`
    pages.push(await render(template(`المحتوى المعتمد ${index + 1}`, 'التصميم والتغريدة المعتمدان', content, index + 5)))
  }

  const pdf = await PDFDocument.create()
  for (const image of pages) {
    const page = pdf.addPage([WIDTH, HEIGHT])
    const embedded = await pdf.embedPng(image)
    page.drawImage(embedded, { x: 0, y: 0, width: WIDTH, height: HEIGHT })
  }
  return Buffer.from(await pdf.save())
}
