import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { formatMembershipNumber, getMembershipPlan, getMembershipPrice } from '@/lib/memberships'

export type ContractMembership = {
  membership_number: number | string
  client_name: string
  client_email: string
  client_phone?: string | null
  plan_id: string
  duration_months: number
  subtotal: number | string
  vat_amount: number | string
  total_amount: number | string
  starts_at: string
  ends_at: string
  terms_version: string
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]!))
}

function rtlText(value: string, x: number, y: number, size = 22, weight = 400, fill = '#263a60') {
  return `<text x="${x}" y="${y}" text-anchor="start" direction="rtl" unicode-bidi="plaintext" font-family="Arial, DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`
}

function detailField(label: string, value: string, x: number, y: number, width: number) {
  const valueSize = value.length > 38 ? 18 : 21
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="82" rx="10" fill="#f7f9fd" stroke="#dce3ef"/>
    ${rtlText(label, x + width - 18, y + 27, 15, 700, '#71809a')}
    ${rtlText(value, x + width - 18, y + 60, valueSize, 700, '#102b5c')}
  </g>`
}

function benefitField(label: string, value: string, x: number, y: number, width: number) {
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="72" rx="10" fill="#ffffff" stroke="#dce3ef"/>
    ${rtlText(label, x + width - 16, y + 27, 14, 700, '#71809a')}
    ${rtlText(value, x + width - 16, y + 55, 19, 700, '#102b5c')}
  </g>`
}

function termRow(number: number, lines: string[], y: number) {
  const text = lines.map((line, index) => rtlText(line, 1080, y + 5 + index * 28, 17, 400, '#334866')).join('')
  return `<g>
    <circle cx="1120" cy="${y - 2}" r="20" fill="#102b5c"/>
    <text x="1120" y="${y + 5}" text-anchor="middle" font-family="Arial, DejaVu Sans, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${number}</text>
    ${text}
  </g>`
}

async function contractSvg(membership: ContractMembership) {
  const plan = getMembershipPlan(membership.plan_id)
  if (!plan) throw new Error('membership_plan_not_found')
  const price = getMembershipPrice(membership.plan_id, membership.duration_months)
  if (!price) throw new Error('membership_price_not_found')

  const logo = await readFile(path.join(process.cwd(), 'public', 'logo.png'))
  const number = formatMembershipNumber(membership.membership_number)
  const start = new Date(membership.starts_at).toLocaleDateString('ar-SA')
  const end = new Date(membership.ends_at).toLocaleDateString('ar-SA')
  const total = Number(membership.total_amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 })
  const reshare = price.benefits.reshare_quote ? `${price.benefits.reshare_quote} وحدات` : 'غير مشمول'
  const pin = price.benefits.pin ? `${price.benefits.pin} مرات` : 'غير مشمول'
  const campaigns = price.benefits.paid_campaign ? `${price.benefits.paid_campaign} حملات` : 'غير مشمولة'

  return Buffer.from(`<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
    <rect width="1240" height="1754" fill="#f3f6fb"/>
    <rect x="42" y="42" width="1156" height="1670" rx="22" fill="#ffffff" stroke="#d7dfec" stroke-width="2"/>
    <rect x="42" y="42" width="1156" height="185" rx="22" fill="#102b5c"/>
    <rect x="1020" y="58" width="150" height="152" rx="14" fill="#ffffff"/>
    <image href="data:image/png;base64,${logo.toString('base64')}" x="1037" y="68" width="116" height="132" preserveAspectRatio="xMidYMid meet"/>
    ${rtlText('عقد عضوية خدمات النشر', 985, 108, 38, 700, '#ffffff')}
    ${rtlText(`${plan.name} · ${number}`, 985, 153, 22, 700, '#d4b66f')}
    ${rtlText('وثيقة إلكترونية معتمدة ومرتبطة بشروط العضوية', 985, 191, 17, 400, '#dce5f5')}

    ${rtlText('بيانات العقد والمشترك', 1138, 278, 24, 700, '#102b5c')}
    <line x1="72" y1="294" x2="1168" y2="294" stroke="#d4b66f" stroke-width="3"/>
    ${detailField('اسم المشترك', membership.client_name, 636, 316, 532)}
    ${detailField('البريد الإلكتروني', membership.client_email, 72, 316, 540)}
    ${detailField('رقم الجوال', membership.client_phone || 'غير مسجل', 636, 410, 532)}
    ${detailField('الباقة ومدة العضوية', `${plan.name} · ${membership.duration_months} أشهر`, 72, 410, 540)}
    ${detailField('مدة العقد', `${start} إلى ${end}`, 636, 504, 532)}
    ${detailField('الإجمالي شامل الضريبة', `${total} ر.س`, 72, 504, 540)}

    <rect x="72" y="614" width="1096" height="358" rx="16" fill="#f7f9fd" stroke="#d7dfec"/>
    ${rtlText('ملخص الرصيد والمزايا', 1138, 660, 24, 700, '#102b5c')}
    ${benefitField('رصيد طلبات النشر', `${price.credits} طلباً`, 861, 686, 283)}
    ${benefitField('إعادة نشر أو اقتباس', reshare, 557, 686, 283)}
    ${benefitField('تثبيت 6 ساعات', pin, 253, 686, 283)}
    ${benefitField('حملات ممولة', campaigns, 861, 772, 283)}
    ${benefitField('طلبات متزامنة', `${plan.concurrentRequestLimit}`, 557, 772, 283)}
    ${benefitField('جولات تعديل لكل طلب', `${plan.revisionRounds}`, 253, 772, 283)}
    ${benefitField('خصم الخدمات الإضافية', `${plan.extraDiscountPct}%`, 861, 858, 283)}
    ${benefitField('المجلة الشخصية', 'مشمولة', 557, 858, 283)}
    ${benefitField('صلاحية الرصيد', 'طوال مدة العضوية', 253, 858, 283)}

    ${rtlText('الأحكام والالتزامات الأساسية', 1138, 1025, 24, 700, '#102b5c')}
    <line x1="72" y1="1042" x2="1168" y2="1042" stroke="#d4b66f" stroke-width="3"/>
    ${termRow(1, ['يُحجز الرصيد عند تقديم الطلب ويُستهلك عند بدء التنفيذ، وينتهي غير المستخدم بانتهاء العضوية', 'ولا يُرحّل إلى عضوية جديدة أو يتحول إلى قيمة نقدية.'], 1090)}
    ${termRow(2, ['تخضع الطلبات لقبول المحتوى واكتمال البيانات والمرفقات، وتبدأ مدة التنفيذ بعد اكتمالها.'], 1170)}
    ${termRow(3, ['يقر المشترك بصحة البيانات وامتلاكه حقوق استخدام الصور والمواد التي يرفعها إلى المنصة.'], 1235)}
    ${termRow(4, ['الخدمات الخارجة عن نطاق الباقة تُسعّر بصورة مستقلة بعد موافقة المشترك.'], 1300)}
    ${termRow(5, ['يخضع الإلغاء والاسترداد لسياسة الاسترجاع المنشورة وما تم تنفيذه أو استهلاكه.'], 1365)}
    ${termRow(6, ['تعد الشروط الكاملة المعتمدة وسياسة الخصوصية جزءاً مكملاً لهذا العقد.'], 1430)}

    <rect x="72" y="1490" width="1096" height="116" rx="14" fill="#102b5c"/>
    ${rtlText('القبول الإلكتروني', 1135, 1532, 19, 700, '#d4b66f')}
    ${rtlText('وافق المشترك إلكترونياً على العقد والشروط، وتم تفعيل العضوية بعد إتمام السداد عبر المنصة.', 1135, 1567, 18, 400, '#ffffff')}
    ${rtlText(`نسخة الشروط: ${membership.terms_version} · المرجع: ${number}`, 1135, 1595, 14, 400, '#cbd7e9')}

    <line x1="72" y1="1650" x2="1168" y2="1650" stroke="#d7dfec"/>
    ${rtlText('نسخة إلكترونية صادرة من nukhba.media', 1138, 1682, 15, 400, '#71809a')}
    <text x="72" y="1682" text-anchor="start" font-family="Arial, DejaVu Sans, sans-serif" font-size="15" fill="#71809a">TAWASOL ALNOKHBA · 1 / 1</text>
  </svg>`)
}

export async function generateMembershipContractPdf(membership: ContractMembership) {
  const svg = await contractSvg(membership)
  const png = await sharp(svg).png().toBuffer()
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(png)
  const page = pdf.addPage([595.28, 841.89])
  page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
  pdf.setTitle(`Membership contract ${formatMembershipNumber(membership.membership_number)}`)
  pdf.setAuthor('Tawasol Alnokhba')
  pdf.setSubject('Membership services contract')
  return Buffer.from(await pdf.save())
}
