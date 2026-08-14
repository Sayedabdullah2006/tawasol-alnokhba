import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { CATEGORIES, EXTRAS, PACKAGES } from '@/lib/constants'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { generateRequestNumber } from '@/lib/utils'

const INVOICE_BUCKET = 'service-invoices'
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
  const features = Array.from(new Set([...(selectedPackage?.features ?? []), ...extraFeatures]))
  const subOption = parseSubOption(request.sub_option)
  const total = numberValue(request.final_total ?? request.admin_quoted_price)
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
  return `<text x="${x}" y="${y}" text-anchor="start" direction="rtl" unicode-bidi="plaintext" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`
}

function ltrText(value: string, x: number, y: number, size = 17, weight = 400, fill = '#263a60') {
  return `<text x="${x}" y="${y}" text-anchor="start" direction="ltr" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`
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

function field(label: string, value: string, x: number, y: number, width: number) {
  const compact = value.length > 42
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="76" rx="10" fill="#f7f9fd" stroke="#dce3ef"/>
    ${rtlText(label, x + width - 16, y + 25, 14, 700, '#71809a')}
    ${rtlLines(value, x + width - 16, y + 55, compact ? 50 : 36, compact ? 16 : 18, 24, 1, 700, '#102b5c')}
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
  const logo = await readFile(path.join(process.cwd(), 'public', 'logo.png'))
  const buyerDisplayName = snapshot.buyer.organizationName ?? snapshot.buyer.name
  const buyerRepresentative = snapshot.buyer.organizationName
    ? snapshot.buyer.representativeName ?? snapshot.buyer.name
    : snapshot.buyer.name
  const contact = [snapshot.buyer.email, snapshot.buyer.phone].filter(Boolean).join(' · ') || 'غير مسجل'
  const sellerDetails = `${snapshot.seller.legalType} · ${snapshot.seller.unifiedNumber}`
  const serviceTitle = `${snapshot.request.category} · ${snapshot.request.type}`
  const channels = snapshot.request.channels.length ? snapshot.request.channels.join('، ') : 'حسب تفاصيل الطلب'
  const packageName = snapshot.request.packageName ?? 'خدمة مخصصة'
  const features = snapshot.request.features.length
    ? snapshot.request.features.slice(0, 7)
    : ['صياغة المحتوى', 'تصميم خاص', 'النشر وفق تفاصيل الطلب']
  const featureLines = features.flatMap(feature => wrapWords(`• ${feature}`, 58, 2)).slice(0, 6)
  const paymentMethod = snapshot.payment.method || snapshot.payment.provider

  return Buffer.from(`<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
    <rect width="1240" height="1754" fill="#eef3fa"/>
    <rect x="38" y="38" width="1164" height="1678" rx="24" fill="#ffffff" stroke="#d7dfec" stroke-width="2"/>
    <rect x="38" y="38" width="1164" height="214" rx="24" fill="#102b5c"/>
    <rect x="1015" y="58" width="158" height="170" rx="16" fill="#ffffff"/>
    <image href="data:image/png;base64,${logo.toString('base64')}" x="1031" y="69" width="126" height="148" preserveAspectRatio="xMidYMid meet"/>
    ${rtlText('فاتورة خدمات مدفوعة', 980, 103, 39, 700, '#ffffff')}
    ${rtlText(invoiceNumber, 980, 151, 24, 700, '#d4b66f')}
    ${rtlText(`تاريخ الإصدار: ${formatSaudiDate(snapshot.payment.paidAt)}`, 980, 190, 17, 400, '#dce5f5')}
    <rect x="72" y="116" width="130" height="54" rx="27" fill="#12805c"/>
    ${rtlText('مدفوعة', 170, 151, 19, 700, '#ffffff')}

    ${rtlText('بيانات مقدم الخدمة', 1158, 302, 23, 700, '#102b5c')}
    <line x1="72" y1="319" x2="1168" y2="319" stroke="#d4b66f" stroke-width="3"/>
    ${field('الاسم القانوني', snapshot.seller.name, 624, 342, 544)}
    ${field('الوصف النظامي', sellerDetails, 72, 342, 528)}
    ${field('المقر', snapshot.seller.address, 624, 430, 544)}
    ${field('التواصل', `${snapshot.seller.email} · ${snapshot.seller.website}`, 72, 430, 528)}

    ${rtlText('بيانات العميل', 1158, 558, 23, 700, '#102b5c')}
    <line x1="72" y1="575" x2="1168" y2="575" stroke="#d4b66f" stroke-width="3"/>
    ${field(snapshot.buyer.organizationName ? 'اسم الجهة' : 'اسم العميل', buyerDisplayName, 624, 598, 544)}
    ${field('صفة مقدم الطلب', snapshot.buyer.type, 72, 598, 528)}
    ${field(snapshot.buyer.organizationName ? 'ممثل الجهة' : 'صاحب الطلب', buyerRepresentative, 624, 686, 544)}
    ${field(snapshot.buyer.organizationName ? 'رقم السجل / الترخيص' : 'المدينة', snapshot.buyer.organizationName ? snapshot.buyer.registrationNumber ?? 'غير مسجل' : snapshot.buyer.city ?? 'غير مسجلة', 72, 686, 528)}
    ${field('بيانات التواصل', contact, 624, 774, 544)}
    ${field('مرجع الطلب', snapshot.request.number, 72, 774, 528)}

    <rect x="72" y="892" width="1096" height="405" rx="17" fill="#f7f9fd" stroke="#d7dfec"/>
    ${rtlText('تفاصيل الخدمة', 1138, 938, 24, 700, '#102b5c')}
    ${rtlText(serviceTitle, 1138, 979, 21, 700, '#263a60')}
    ${rtlLines(snapshot.request.title, 1138, 1015, 78, 17, 27, 2, 400, '#52627d')}
    ${rtlText(`الحساب الناشر: ${snapshot.request.accountName}`, 1138, 1085, 18, 700, '#12805c')}
    ${rtlText(`الباقة: ${packageName} · عدد المنشورات: ${snapshot.request.postCount}`, 1138, 1123, 18, 700, '#263a60')}
    ${rtlText(`قنوات النشر: ${channels}`, 1138, 1161, 17, 400, '#52627d')}
    ${rtlText('مميزات الباقة والخدمة', 1138, 1204, 17, 700, '#102b5c')}
    ${featureLines.map((line, index) => rtlText(line, index % 2 === 0 ? 1138 : 590, 1227 + Math.floor(index / 2) * 27, 14, 400, '#52627d')).join('')}

    ${rtlText('ملخص المبلغ والدفع', 1158, 1350, 23, 700, '#102b5c')}
    <line x1="72" y1="1367" x2="1168" y2="1367" stroke="#d4b66f" stroke-width="3"/>
    <rect x="72" y="1390" width="1096" height="184" rx="15" fill="#ffffff" stroke="#d7dfec"/>
    ${rtlText('قيمة الخدمة قبل الخصم', 1138, 1430, 17, 400, '#52627d')}
    ${rtlText(`${formatMoney(snapshot.pricing.subtotal)} ر.س`, 450, 1430, 18, 700, '#263a60')}
    ${snapshot.pricing.discount > 0 ? `${rtlText('الخصم', 1138, 1467, 17, 400, '#52627d')}${rtlText(`- ${formatMoney(snapshot.pricing.discount)} ر.س`, 450, 1467, 18, 700, '#b42318')}` : ''}
    ${rtlText('ضريبة القيمة المضافة', 1138, 1504, 17, 400, '#52627d')}
    ${rtlText('غير مطبقة', 450, 1504, 18, 700, '#52627d')}
    <line x1="92" y1="1524" x2="1148" y2="1524" stroke="#d7dfec"/>
    ${rtlText('الإجمالي المدفوع', 1138, 1555, 20, 700, '#102b5c')}
    ${rtlText(`${formatMoney(snapshot.pricing.total)} ر.س`, 450, 1555, 25, 700, '#12805c')}

    ${rtlText(`وسيلة الدفع: ${paymentMethod}`, 1138, 1618, 15, 400, '#52627d')}
    ${snapshot.payment.reference ? ltrText(`Reference: ${snapshot.payment.reference}`, 72, 1618, 14, 400, '#52627d') : ''}
    <rect x="72" y="1642" width="1096" height="45" rx="10" fill="#fff8e8"/>
    ${rtlText('شركة تواصل النخبة غير مسجلة حالياً في ضريبة القيمة المضافة؛ لذلك لا تتضمن هذه الفاتورة ضريبة قيمة مضافة.', 1140, 1671, 14, 700, '#765812')}
    ${rtlText('فاتورة إلكترونية مرتبطة بسجل الدفع والطلب في nukhba.media', 1138, 1708, 13, 400, '#71809a')}
    ${ltrText('TAWASOL ALNOKHBA · 1 / 1', 72, 1708, 13, 400, '#71809a')}
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
    .update({ pdf_path: pdfPath, updated_at: new Date().toISOString() })
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
  let pdf = invoice.pdf_path ? await downloadStoredPdf(invoice.pdf_path) : null
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
