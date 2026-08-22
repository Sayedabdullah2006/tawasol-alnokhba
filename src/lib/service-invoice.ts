import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { CATEGORIES, EXTRAS, getPackageFeaturesForPostPrice, PACKAGES } from '@/lib/constants'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { generateRequestNumber } from '@/lib/utils'

const INVOICE_BUCKET = 'service-invoices'
const INVOICE_FONT_FAMILY = 'InvoiceArabic'
const CURRENT_INVOICE_TEMPLATE_VERSION = 2
const SELLER = {
  name: 'شركة تواصل النخبة للدعاية والإعلان',
  legalType: 'شركة ذات مسؤولية محدودة',
  unifiedNumber: '7042572656',
  address: 'المملكة العربية السعودية',
  email: 'support@nukhba.media',
  website: 'nukhba.media',
}

type JsonObject = Record<string, unknown>

export type ServiceInvoiceSnapshot = {
  seller: typeof SELLER
  buyer: {
    type: string
    name: string
    organizationName: string | null
    representativeName: string | null
    registrationNumber: string | null
    email: string | null
    phone: string | null
    city: string | null
  }
  request: {
    id: string
    number: string
    title: string
    type: string
    category: string
    packageName: string | null
    accountName: string
    postCount: number
    channels: string[]
    features: string[]
  }
  pricing: {
    subtotal: number
    discount: number
    total: number
    currency: 'SAR'
    vatApplicable: false
  }
  payment: {
    provider: string
    method: string | null
    reference: string | null
    paidAt: string
  }
}

type ServiceInvoiceRow = {
  id: string
  invoice_number: string
  request_id: string | null
  user_id: string | null
  request_number: number
  amount: number | string
  snapshot: ServiceInvoiceSnapshot
  pdf_path: string | null
  email_sent_at: string | null
  template_version: number | null
}

export type ServiceInvoiceDocument = {
  id: string
  invoiceNumber: string
  requestId: string
  pdf: Buffer
  filename: string
  snapshot: ServiceInvoiceSnapshot
}

export type PaymentInvoiceOverrides = {
  provider?: string
  method?: string | null
  reference?: string | null
  paidAt?: string | null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function parseSubOption(value: unknown): JsonObject | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : null
  } catch {
    return null
  }
}

function clientTypeLabel(value: string | null) {
  return ({
    individual: 'فرد',
    business: 'شركة / مؤسسة',
    government: 'جهة حكومية',
    charity: 'جهة غير ربحية',
    agency: 'وكالة',
  } as Record<string, string>)[value ?? 'individual'] ?? 'عميل'
}

function channelLabel(value: string) {
  return ({ x: 'X', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok' } as Record<string, string>)[value] ?? value
}

function resolvePaymentProvider(request: JsonObject, overrides: PaymentInvoiceOverrides) {
  if (overrides.provider) return overrides.provider
  if (stringValue(request.tamara_order_id)) return 'تمارا'
  if (stringValue(request.moyasar_payment_id)) return 'ميسر'
  if (stringValue(request.receipt_url)) return 'تحويل بنكي'
  return 'دفع معتمد من الإدارة'
}

function createSnapshot(request: JsonObject, overrides: PaymentInvoiceOverrides): ServiceInvoiceSnapshot {
  const selectedPackageId = stringValue(request.auto_quote_tier) ?? stringValue(request.selected_package)
  const selectedPackage = PACKAGES.find(item => item.id === selectedPackageId)
  const category = CATEGORIES.find(item => item.id === request.category)
  const selectedExtras = stringArray(request.user_selected_extras)
  const extraFeatures = selectedExtras
    .map(id => EXTRAS.find(item => item.id === id)?.nameAr)
    .filter((item): item is string => Boolean(item))
  const total = numberValue(request.final_total ?? request.admin_quoted_price)
  const campaignPostCount = Array.isArray(request.campaign_posts) && request.campaign_posts.length > 0
    ? request.campaign_posts.length
    : 1
  const packageFeatures = selectedPackage
    ? getPackageFeaturesForPostPrice(selectedPackage, total / campaignPostCount)
    : []
  const features = Array.from(new Set([...packageFeatures, ...extraFeatures]))
  const subOption = parseSubOption(request.sub_option)
  const explicitDiscount = Math.max(
    0,
    numberValue(request.discount_amount),
    numberValue(request.discount_amt),
  )
  const subtotal = Math.max(
    total,
    total + explicitDiscount,
    numberValue(request.original_quoted_price),
    numberValue(request.campaign_subtotal),
  )
  const discount = Math.max(0, subtotal - total)
  const clientType = stringValue(request.client_type) ?? 'individual'
  const organizationName = stringValue(request.org_name)
  const requestType = stringValue(request.request_type) === 'campaign' ? 'حملة متعددة المنشورات' : 'منشور واحد'
  const fallbackTitle = stringValue(subOption?.product_name) ?? 'خدمة نشر إعلامي ورقمي'
  const paidAt = overrides.paidAt ?? stringValue(request.paid_at) ?? new Date().toISOString()
  const paymentReference = overrides.reference
    ?? stringValue(request.moyasar_reference)
    ?? stringValue(request.tamara_order_id)
    ?? stringValue(request.moyasar_payment_id)

  return {
    seller: SELLER,
    buyer: {
      type: clientTypeLabel(clientType),
      name: stringValue(request.client_name) ?? 'عميل تواصل النخبة',
      organizationName,
      representativeName: stringValue(request.org_representative),
      registrationNumber: stringValue(request.org_license),
      email: stringValue(request.client_email),
      phone: stringValue(request.client_phone),
      city: stringValue(request.client_city),
    },
    request: {
      id: String(request.id),
      number: generateRequestNumber(numberValue(request.request_number)),
      title: stringValue(request.title) ?? fallbackTitle,
      type: requestType,
      category: category?.nameAr ?? stringValue(request.category) ?? 'خدمة نشر',
      packageName: selectedPackage?.name ?? null,
      accountName: 'أول سعودي First1Saudi',
      postCount: Math.max(1, numberValue(request.num_posts ?? request.campaign_post_count, 1)),
      channels: stringArray(request.channels).map(channelLabel),
      features,
    },
    pricing: {
      subtotal,
      discount,
      total,
      currency: 'SAR',
      vatApplicable: false,
    },
    payment: {
      provider: resolvePaymentProvider(request, overrides),
      method: overrides.method ?? stringValue(request.payment_method),
      reference: paymentReference,
      paidAt,
    },
  }
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[character]!))
}

function rtlText(value: string, x: number, y: number, size = 20, weight = 400, fill = '#263a60') {
  return `<text x="${x}" y="${y}" text-anchor="start" direction="rtl" unicode-bidi="plaintext" font-family="${INVOICE_FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`
}

function ltrText(value: string, x: number, y: number, size = 17, weight = 400, fill = '#263a60') {
  return `<text x="${x}" y="${y}" text-anchor="start" direction="ltr" font-family="${INVOICE_FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`
}

function centeredText(value: string, x: number, y: number, size = 20, weight = 700, fill = '#111827') {
  return `<text x="${x}" y="${y}" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="${INVOICE_FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`
}

function wrapWords(value: string, maxCharacters: number, maxLines = 3) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharacters || !current) current = candidate
    else {
      lines.push(current)
      current = word
      if (lines.length === maxLines - 1) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  const consumed = lines.join(' ').length
  if (consumed < value.replace(/\s+/g, ' ').trim().length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, '')}…`
  }
  return lines
}

function rtlLines(value: string, x: number, y: number, maxCharacters: number, size = 18, lineHeight = 29, maxLines = 3, weight = 400, fill = '#263a60') {
  return wrapWords(value, maxCharacters, maxLines)
    .map((line, index) => rtlText(line, x, y + index * lineHeight, size, weight, fill))
    .join('')
}

function formalField(labelAr: string, labelEn: string, value: string, x: number, y: number, width: number, height = 76) {
  const compact = value.length > 42
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="#1f2937" stroke-width="1.4"/>
    ${rtlText(labelAr, x + width - 12, y + 23, 13, 700, '#344054')}
    ${ltrText(labelEn, x + 12, y + 23, 11, 700, '#667085')}
    ${rtlLines(value, x + width - 12, y + 53, compact ? 48 : 36, compact ? 15 : 17, 23, Math.max(1, Math.floor((height - 42) / 23)), 700, '#101828')}
  </g>`
}

function formatMoney(value: number) {
  return value.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatSaudiDate(value: string) {
  return new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

async function invoiceSvg(snapshot: ServiceInvoiceSnapshot, invoiceNumber: string) {
  const [logo, invoiceFont] = await Promise.all([
    readFile(path.join(process.cwd(), 'public', 'logo.png')),
    readFile(path.join(process.cwd(), 'public', 'fonts', 'NotoSansArabic-Variable.ttf')),
  ])
  const buyerDisplayName = snapshot.buyer.organizationName ?? snapshot.buyer.name
  const buyerRepresentative = snapshot.buyer.organizationName
    ? snapshot.buyer.representativeName ?? snapshot.buyer.name
    : snapshot.buyer.name
  const contact = [snapshot.buyer.email, snapshot.buyer.phone].filter(Boolean).join(' · ') || 'غير مسجل'
  const serviceTitle = `${snapshot.request.category} - ${snapshot.request.type}`
  const channels = snapshot.request.channels.length ? snapshot.request.channels.join('، ') : 'حسب تفاصيل الطلب'
  const packageName = snapshot.request.packageName ?? 'خدمة مخصصة'
  const features = snapshot.request.features.length
    ? snapshot.request.features.slice(0, 7)
    : ['صياغة المحتوى', 'تصميم خاص', 'النشر وفق تفاصيل الطلب']
  const featureLines = features.flatMap(feature => wrapWords(`• ${feature}`, 67, 2)).slice(0, 8)
  const paymentMethod = snapshot.payment.method || snapshot.payment.provider
  const description = [
    snapshot.request.title,
    `الحساب الناشر: ${snapshot.request.accountName}`,
    `الباقة: ${packageName} - القنوات: ${channels}`,
  ]
  const lineColumns = [50, 165, 285, 435, 525, 885, 1140, 1190]

  return Buffer.from(`<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
    <style>
      @font-face {
        font-family: '${INVOICE_FONT_FAMILY}';
        src: url(data:font/ttf;base64,${invoiceFont.toString('base64')}) format('truetype');
        font-style: normal;
        font-weight: 100 900;
      }
    </style>
    <rect width="1240" height="1754" fill="#ffffff"/>
    <rect x="50" y="45" width="1140" height="1658" fill="#ffffff" stroke="#111827" stroke-width="2"/>

    <!-- Seller identity: formal bilingual header -->
    <rect x="50" y="45" width="1140" height="222" fill="#ffffff" stroke="#111827" stroke-width="2"/>
    <line x1="620" y1="45" x2="620" y2="267" stroke="#111827" stroke-width="1.4"/>
    <image href="data:image/png;base64,${logo.toString('base64')}" x="550" y="62" width="140" height="130" preserveAspectRatio="xMidYMid meet"/>
    ${rtlText(snapshot.seller.name, 1165, 83, 20, 800, '#102b5c')}
    ${rtlText(`الكيان القانوني: ${snapshot.seller.legalType}`, 1165, 121, 15, 600, '#1f2937')}
    ${rtlText(`الرقم الموحد: ${snapshot.seller.unifiedNumber}`, 1165, 155, 15, 700, '#1f2937')}
    ${rtlText(`العنوان: ${snapshot.seller.address}`, 1165, 189, 15, 600, '#1f2937')}
    ${rtlText(`التواصل: ${snapshot.seller.email}`, 1165, 223, 14, 500, '#475467')}
    ${ltrText('TAWASOL ALNOKHBA ADVERTISING CO.', 75, 83, 18, 800, '#102b5c')}
    ${ltrText('Limited Liability Company', 75, 121, 14, 600, '#1f2937')}
    ${ltrText(`Unified No.: ${snapshot.seller.unifiedNumber}`, 75, 155, 14, 700, '#1f2937')}
    ${ltrText('Kingdom of Saudi Arabia', 75, 189, 14, 600, '#1f2937')}
    ${ltrText(snapshot.seller.website, 75, 223, 14, 500, '#475467')}

    <rect x="50" y="279" width="1140" height="66" fill="#f5f7fa" stroke="#111827" stroke-width="2"/>
    ${centeredText('فاتورة / INVOICE', 620, 321, 27, 800, '#102b5c')}

    <!-- Invoice metadata -->
    ${formalField('رقم الفاتورة', 'Invoice Number', invoiceNumber, 810, 357, 380, 82)}
    ${formalField('تاريخ الإصدار', 'Issue Date', formatSaudiDate(snapshot.payment.paidAt), 430, 357, 380, 82)}
    ${formalField('حالة الدفع', 'Payment Status', `مدفوعة - ${paymentMethod}`, 50, 357, 380, 82)}

    <!-- Buyer data -->
    <rect x="50" y="451" width="1140" height="45" fill="#102b5c" stroke="#111827" stroke-width="2"/>
    ${rtlText('بيانات العميل', 1165, 481, 18, 800, '#ffffff')}
    ${ltrText('CUSTOMER INFORMATION', 75, 481, 13, 700, '#ffffff')}
    ${formalField(snapshot.buyer.organizationName ? 'اسم الجهة' : 'اسم العميل', 'Customer', buyerDisplayName, 620, 496, 570, 82)}
    ${formalField('نوع العميل', 'Customer Type', snapshot.buyer.type, 50, 496, 570, 82)}
    ${formalField(snapshot.buyer.organizationName ? 'ممثل الجهة' : 'صاحب الطلب', 'Representative', buyerRepresentative, 620, 578, 570, 82)}
    ${formalField(snapshot.buyer.organizationName ? 'السجل / الترخيص' : 'المدينة', snapshot.buyer.organizationName ? 'Registration No.' : 'City', snapshot.buyer.organizationName ? snapshot.buyer.registrationNumber ?? 'غير مسجل' : snapshot.buyer.city ?? 'غير مسجلة', 50, 578, 570, 82)}
    ${formalField('بيانات التواصل', 'Contact', contact, 620, 660, 570, 82)}
    ${formalField('مرجع الطلب', 'Request Reference', snapshot.request.number, 50, 660, 570, 82)}

    <!-- Service line table -->
    <rect x="50" y="760" width="1140" height="45" fill="#102b5c" stroke="#111827" stroke-width="2"/>
    ${rtlText('تفاصيل الخدمة', 1165, 790, 18, 800, '#ffffff')}
    ${ltrText('SERVICE DETAILS', 75, 790, 13, 700, '#ffffff')}
    <rect x="50" y="805" width="1140" height="72" fill="#f2f4f7" stroke="#111827" stroke-width="1.5"/>
    ${lineColumns.slice(1, -1).map(x => `<line x1="${x}" y1="805" x2="${x}" y2="1115" stroke="#111827" stroke-width="1.2"/>`).join('')}
    ${centeredText('الإجمالي', 108, 842, 14, 700)}
    ${centeredText('الخصم', 225, 842, 14, 700)}
    ${centeredText('سعر الوحدة', 360, 842, 14, 700)}
    ${centeredText('الكمية', 480, 842, 14, 700)}
    ${centeredText('البيان', 705, 842, 14, 700)}
    ${centeredText('اسم الخدمة', 1012, 842, 14, 700)}
    ${centeredText('م', 1165, 842, 14, 700)}
    <line x1="50" y1="877" x2="1190" y2="877" stroke="#111827" stroke-width="1.2"/>
    <rect x="50" y="877" width="1140" height="238" fill="#ffffff" stroke="#111827" stroke-width="1.5"/>
    ${lineColumns.slice(1, -1).map(x => `<line x1="${x}" y1="877" x2="${x}" y2="1115" stroke="#111827" stroke-width="1.2"/>`).join('')}
    ${centeredText(formatMoney(snapshot.pricing.total), 108, 925, 15, 700, '#102b5c')}
    ${centeredText(formatMoney(snapshot.pricing.discount), 225, 925, 14, 600)}
    ${centeredText(formatMoney(snapshot.pricing.subtotal), 360, 925, 14, 600)}
    ${centeredText(String(snapshot.request.postCount), 480, 925, 15, 700)}
    ${rtlLines(description.join(' | '), 860, 918, 43, 13, 24, 6, 500, '#344054')}
    ${rtlLines(serviceTitle, 1125, 918, 23, 15, 26, 4, 700, '#101828')}
    ${centeredText('1', 1165, 925, 15, 700)}

    <!-- Included deliverables -->
    <rect x="50" y="1132" width="1140" height="185" fill="#ffffff" stroke="#111827" stroke-width="1.5"/>
    <rect x="50" y="1132" width="1140" height="42" fill="#f2f4f7" stroke="#111827" stroke-width="1.2"/>
    ${rtlText('المخرجات والمزايا المشمولة', 1165, 1160, 16, 800, '#102b5c')}
    ${ltrText('INCLUDED DELIVERABLES', 75, 1160, 12, 700, '#475467')}
    ${featureLines.map((line, index) => rtlText(line, index % 2 === 0 ? 1160 : 610, 1204 + Math.floor(index / 2) * 28, 14, 500, '#344054')).join('')}

    <!-- Totals -->
    <rect x="50" y="1334" width="1140" height="211" fill="#ffffff" stroke="#111827" stroke-width="1.8"/>
    <line x1="620" y1="1334" x2="620" y2="1545" stroke="#111827" stroke-width="1.2"/>
    ${rtlText('ملخص المبلغ', 1165, 1365, 17, 800, '#102b5c')}
    ${rtlText('المبلغ قبل الخصم', 1165, 1402, 14, 600, '#344054')}
    ${rtlText(`${formatMoney(snapshot.pricing.subtotal)} ر.س`, 790, 1402, 15, 700, '#101828')}
    ${rtlText('الخصم', 1165, 1438, 14, 600, '#344054')}
    ${rtlText(`${formatMoney(snapshot.pricing.discount)} ر.س`, 790, 1438, 15, 700, '#b42318')}
    ${rtlText('ضريبة القيمة المضافة', 1165, 1474, 14, 600, '#344054')}
    ${rtlText('غير مطبقة', 790, 1474, 15, 700, '#344054')}
    <line x1="640" y1="1490" x2="1170" y2="1490" stroke="#111827" stroke-width="1.2"/>
    ${rtlText('الإجمالي المدفوع', 1165, 1524, 17, 800, '#102b5c')}
    ${rtlText(`${formatMoney(snapshot.pricing.total)} ر.س`, 790, 1524, 20, 800, '#12805c')}
    ${rtlText('بيانات السداد', 595, 1365, 17, 800, '#102b5c')}
    ${rtlText(`وسيلة الدفع: ${paymentMethod}`, 595, 1404, 14, 600, '#344054')}
    ${rtlText(`تاريخ السداد: ${formatSaudiDate(snapshot.payment.paidAt)}`, 595, 1442, 14, 600, '#344054')}
    ${snapshot.payment.reference ? `${rtlText('مرجع العملية', 595, 1480, 14, 600, '#344054')}${ltrText(snapshot.payment.reference, 75, 1515, 13, 600, '#101828')}` : ''}

    <!-- Legal VAT treatment -->
    <rect x="50" y="1562" width="1140" height="91" fill="#fff8e6" stroke="#b79239" stroke-width="1.5"/>
    ${rtlText('بيان المعاملة الضريبية', 1165, 1591, 15, 800, '#765812')}
    ${rtlLines('شركة تواصل النخبة غير مسجلة حالياً في ضريبة القيمة المضافة؛ لذلك لم تُحصّل أو تُضف ضريبة قيمة مضافة إلى هذه الفاتورة.', 1165, 1622, 102, 13, 23, 2, 600, '#765812')}
    ${rtlText('فاتورة إلكترونية مرتبطة بسجل الدفع والطلب في nukhba.media', 1165, 1682, 12, 500, '#667085')}
    ${ltrText('TAWASOL ALNOKHBA  |  1 / 1', 75, 1682, 12, 600, '#667085')}
  </svg>`)
}

export async function generateServiceInvoicePdf(snapshot: ServiceInvoiceSnapshot, invoiceNumber: string) {
  const svg = await invoiceSvg(snapshot, invoiceNumber)
  const png = await sharp(svg).png().toBuffer()
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(png)
  const page = pdf.addPage([595.28, 841.89])
  page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
  pdf.setTitle(`Service invoice ${invoiceNumber}`)
  pdf.setAuthor('Tawasol Alnokhba Advertising Company')
  pdf.setSubject(`Paid service invoice for ${snapshot.request.number}`)
  pdf.setCreationDate(new Date(snapshot.payment.paidAt))
  return Buffer.from(await pdf.save())
}

async function downloadStoredPdf(pdfPath: string) {
  const service = await createServiceRoleClient()
  const { data, error } = await service.storage.from(INVOICE_BUCKET).download(pdfPath)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

async function persistPdf(invoice: ServiceInvoiceRow, pdf: Buffer) {
  const service = await createServiceRoleClient()
  const year = invoice.invoice_number.split('-')[1] || new Date().getFullYear().toString()
  const pdfPath = `${year}/${invoice.invoice_number}.pdf`
  const { error: uploadError } = await service.storage
    .from(INVOICE_BUCKET)
    .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw uploadError
  const { error: updateError } = await service
    .from('service_invoices')
    .update({
      pdf_path: pdfPath,
      template_version: CURRENT_INVOICE_TEMPLATE_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)
  if (updateError) throw updateError
  return pdfPath
}

async function getInvoiceRowByRequest(requestId: string) {
  const service = await createServiceRoleClient()
  const { data, error } = await service
    .from('service_invoices')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle()
  if (error) throw error
  return data as ServiceInvoiceRow | null
}

export async function ensureServiceInvoice(requestId: string, overrides: PaymentInvoiceOverrides = {}): Promise<ServiceInvoiceDocument> {
  const service = await createServiceRoleClient()
  let invoice = await getInvoiceRowByRequest(requestId)

  if (!invoice) {
    const { data: request, error: requestError } = await service
      .from('publish_requests')
      .select('*')
      .eq('id', requestId)
      .single()
    if (requestError || !request) throw requestError ?? new Error('invoice_request_not_found')

    const requestRecord = request as JsonObject
    const total = numberValue(requestRecord.final_total ?? requestRecord.admin_quoted_price)
    const paid = requestRecord.payment_status === 'paid'
      || Boolean(stringValue(requestRecord.paid_at))
      || Boolean(stringValue(requestRecord.moyasar_payment_id))
      || Boolean(stringValue(requestRecord.tamara_order_id))
    if (!paid || total <= 0) throw new Error('invoice_request_not_paid')

    const snapshot = createSnapshot(requestRecord, overrides)
    const insertPayload = {
      request_id: requestId,
      user_id: stringValue(requestRecord.user_id),
      request_number: numberValue(requestRecord.request_number),
      amount: snapshot.pricing.total,
      currency: 'SAR',
      payment_provider: snapshot.payment.provider,
      payment_method: snapshot.payment.method,
      payment_reference: snapshot.payment.reference,
      paid_at: snapshot.payment.paidAt,
      snapshot,
      template_version: CURRENT_INVOICE_TEMPLATE_VERSION,
    }
    const { data: inserted, error: insertError } = await service
      .from('service_invoices')
      .insert(insertPayload)
      .select('*')
      .single()
    if (insertError) {
      if (insertError.code !== '23505') throw insertError
      invoice = await getInvoiceRowByRequest(requestId)
    } else invoice = inserted as ServiceInvoiceRow
  }

  if (!invoice) throw new Error('invoice_creation_failed')
  const currentTemplate = Number(invoice.template_version ?? 1) >= CURRENT_INVOICE_TEMPLATE_VERSION
  let pdf = currentTemplate && invoice.pdf_path ? await downloadStoredPdf(invoice.pdf_path) : null
  if (!pdf) {
    pdf = await generateServiceInvoicePdf(invoice.snapshot, invoice.invoice_number)
    await persistPdf(invoice, pdf)
  }

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    requestId,
    pdf,
    filename: `${invoice.invoice_number}.pdf`,
    snapshot: invoice.snapshot,
  }
}

export async function markServiceInvoiceEmailed(invoiceId: string) {
  const service = await createServiceRoleClient()
  const { error } = await service
    .from('service_invoices')
    .update({ email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', invoiceId)
  if (error) console.error('[INVOICE] Failed to mark invoice email:', error)
}
