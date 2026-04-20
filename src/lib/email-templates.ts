// HTML email templates — all RTL Arabic, brand-aligned (navy + gold).
// Each generator returns { subject, html } ready for Resend.

const BRAND_NAVY = '#0E2855'
const BRAND_GOLD = '#C9A961'
const SITE_URL = 'https://nukhba.media'

const wrap = (innerHtml: string): string => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تواصل النخبة</title>
</head>
<body style="margin:0; padding:0; background:#F7F4ED; font-family: -apple-system, 'Segoe UI', Cairo, Arial, sans-serif; color:${BRAND_NAVY};">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F4ED; padding:24px 12px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background:#FFFFFF; border-radius:16px; overflow:hidden; box-shadow:0 2px 8px rgba(14,40,85,0.08);">
        <!-- Header -->
        <tr><td style="background:${BRAND_NAVY}; padding:24px; text-align:center;">
          <h1 style="margin:0; color:#FFFFFF; font-size:22px; font-weight:900; letter-spacing:0.5px;">تواصل النخبة</h1>
          <p style="margin:4px 0 0 0; color:${BRAND_GOLD}; font-size:11px; letter-spacing:2px; font-weight:bold;">TAWASOL ALNOKHBA</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 28px;">
          ${innerHtml}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F7F4ED; padding:18px; text-align:center; border-top:1px solid #E3DCC9;">
          <p style="margin:0 0 6px 0; color:${BRAND_NAVY}; font-size:12px; font-weight:bold;">تواصل النخبة · Tawasol Al-Nokhba</p>
          <p style="margin:0; color:#6B7C99; font-size:11px;">هذه رسالة من نظام آلي، يرجى عدم الرد عليها.</p>
          <p style="margin:8px 0 0 0;">
            <a href="${SITE_URL}" style="color:${BRAND_GOLD}; text-decoration:none; font-size:11px;">${SITE_URL.replace('https://','')}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const button = (label: string, href: string): string =>
  `<a href="${href}" style="display:inline-block; background:${BRAND_GOLD}; color:${BRAND_NAVY}; text-decoration:none; padding:12px 28px; border-radius:10px; font-weight:bold; font-size:14px; margin-top:8px;">${label}</a>`

const greeting = (name: string): string =>
  `<p style="margin:0 0 16px 0; font-size:15px;">مرحباً <strong>${escapeHtml(name)}</strong> 👋</p>`

const note = (text: string): string =>
  `<div style="background:#F7F4ED; border-right:3px solid ${BRAND_GOLD}; padding:12px 14px; border-radius:8px; margin:14px 0; font-size:13px; line-height:1.7; white-space:pre-line;">${escapeHtml(text)}</div>`

function escapeHtml(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c))
}

// ─── Templates ─────────────────────────────────────────────────────────

export interface ClientRequestData {
  requestNumber: string
  clientName: string
  category: string
  title: string
  content: string
  channels: string[]
  clientEmail?: string
  clientPhone?: string
}

const CHANNEL_LABELS: Record<string, string> = {
  x: 'X', ig: 'Instagram', li: 'LinkedIn', tk: 'TikTok',
}

// 1. Request received — to client
export function requestReceivedToClient(d: ClientRequestData) {
  return {
    subject: `استلمنا طلبك · ${d.requestNumber}`,
    html: wrap(`
      ${greeting(d.clientName)}
      <p style="margin:0 0 16px 0; font-size:15px;">✅ <strong>تم استلام طلبك بنجاح</strong></p>
      <p style="margin:0 0 8px 0; font-size:13px; color:#6B7C99;">رقم الطلب: <strong style="color:${BRAND_NAVY};">${escapeHtml(d.requestNumber)}</strong></p>
      <p style="margin:0 0 18px 0; font-size:13px; line-height:1.8;">
        فريقنا الآن يراجع المحتوى وسنتواصل معك خلال 24 ساعة بـ:
      </p>
      <ul style="margin:0 0 18px 0; padding-right:20px; font-size:13px; line-height:1.9;">
        <li>تسعيرة مخصصة لطلبك</li>
        <li>خيارات الخدمات الإضافية المتاحة</li>
      </ul>
      <p style="margin:0 0 20px 0; font-size:13px;">📋 يمكنك متابعة حالة طلبك في لوحة التحكم.</p>
      <p style="margin:0; text-align:center;">${button('عرض الطلب', `${SITE_URL}/dashboard`)}</p>
    `),
  }
}

// 2. New request — to admin
export function newRequestToAdmin(d: ClientRequestData) {
  return {
    subject: `📩 طلب نشر جديد · ${d.requestNumber}`,
    html: wrap(`
      <p style="margin:0 0 16px 0; font-size:16px; font-weight:bold;">📩 طلب نشر جديد يحتاج مراجعة</p>
      <div style="background:#F7F4ED; border-radius:10px; padding:14px; margin-bottom:14px;">
        <p style="margin:0 0 8px 0; font-size:13px;"><strong>رقم الطلب:</strong> ${escapeHtml(d.requestNumber)}</p>
        <p style="margin:4px 0; font-size:13px;"><strong>العميل:</strong> ${escapeHtml(d.clientName)}</p>
        <p style="margin:4px 0; font-size:13px;"><strong>البريد:</strong> <span dir="ltr">${escapeHtml(d.clientEmail ?? '')}</span></p>
        <p style="margin:4px 0; font-size:13px;"><strong>الجوال:</strong> <span dir="ltr">${escapeHtml(d.clientPhone ?? '')}</span></p>
      </div>
      <div style="background:#F7F4ED; border-radius:10px; padding:14px; margin-bottom:18px;">
        <p style="margin:4px 0; font-size:13px;"><strong>الفئة:</strong> ${escapeHtml(d.category)}</p>
        <p style="margin:4px 0; font-size:13px;"><strong>القنوات:</strong> ${d.channels.map(c => CHANNEL_LABELS[c] ?? c).join('، ')}</p>
        <p style="margin:8px 0 4px 0; font-size:13px;"><strong>العنوان:</strong> ${escapeHtml(d.title)}</p>
        <p style="margin:6px 0 0 0; font-size:12px; color:#6B7C99; white-space:pre-line; line-height:1.7;">${escapeHtml(d.content)}</p>
      </div>
      <p style="margin:0; text-align:center;">${button('فتح في لوحة الإدارة', `${SITE_URL}/admin/requests`)}</p>
    `),
  }
}

// 3. Quote ready — to client
export function quoteReadyToClient(d: {
  requestNumber: string
  clientName: string
  price: number
  reach: number
}) {
  return {
    subject: `💰 وصلتك تسعيرة طلبك · ${d.requestNumber}`,
    html: wrap(`
      ${greeting(d.clientName)}
      <p style="margin:0 0 18px 0; font-size:14px; line-height:1.8;">
        فريقنا انتهى من مراجعة طلبك <strong>${escapeHtml(d.requestNumber)}</strong> وأرسل التسعيرة:
      </p>
      <div style="background:#F7F4ED; border-radius:12px; padding:18px; text-align:center; margin-bottom:18px;">
        <p style="margin:0 0 4px 0; font-size:12px; color:#6B7C99;">السعر الرئيسي</p>
        <p style="margin:0 0 12px 0; font-size:28px; font-weight:900; color:${BRAND_GOLD};">${d.price.toLocaleString('ar-SA')} ر.س</p>
        <p style="margin:0 0 4px 0; font-size:12px; color:#6B7C99;">الوصول المتوقع</p>
        <p style="margin:0; font-size:18px; font-weight:bold; color:${BRAND_NAVY};">${formatReach(d.reach)} متابع</p>
      </div>
      <p style="margin:0 0 18px 0; font-size:13px; line-height:1.8;">
        يمكنك أيضاً اختيار خدمات إضافية لتعزيز الحملة. السعر والوصول يتحدّثان فورياً مع كل اختيار.
      </p>
      <p style="margin:0; text-align:center;">${button('مراجعة التسعيرة', `${SITE_URL}/dashboard`)}</p>
    `),
  }
}

// 4. Free gift quote — to client
export function freeGiftToClient(d: {
  requestNumber: string
  clientName: string
  adminMessage: string
}) {
  return {
    subject: `🎁 منشور مجاني من تواصل النخبة · ${d.requestNumber}`,
    html: wrap(`
      ${greeting(d.clientName)}
      <div style="text-align:center; margin-bottom:20px;">
        <div style="font-size:48px;">🎁</div>
        <p style="margin:8px 0 0 0; font-size:18px; font-weight:900; color:${BRAND_GOLD};">منشور مجاني</p>
      </div>
      <p style="margin:0 0 16px 0; font-size:14px; line-height:1.8;">
        يسعدنا إخبارك أن طلبك <strong>${escapeHtml(d.requestNumber)}</strong> سيُنشر بدون مقابل.
      </p>
      <p style="margin:0 0 8px 0; font-size:13px; color:#6B7C99;">رسالة من الإدارة:</p>
      ${note(d.adminMessage)}
      <p style="margin:18px 0; font-size:13px; line-height:1.8;">
        ما عليك سوى الموافقة وسنبدأ التنفيذ مباشرة.
      </p>
      <p style="margin:0; text-align:center;">${button('عرض الطلب', `${SITE_URL}/dashboard`)}</p>
    `),
  }
}

// 5b. Free request approved — to client (skips payment)
export function freeApprovedToClient(d: {
  requestNumber: string
  clientName: string
}) {
  return {
    subject: `✅ تمت الموافقة على طلبك · ${d.requestNumber}`,
    html: wrap(`
      ${greeting(d.clientName)}
      <div style="text-align:center; margin-bottom:18px;">
        <div style="font-size:48px;">✅</div>
        <p style="margin:8px 0 0 0; font-size:18px; font-weight:900; color:${BRAND_GOLD};">تمت الموافقة على طلبك</p>
      </div>
      <p style="margin:0 0 16px 0; font-size:14px; line-height:1.8;">
        🗓️ <strong>جاري جدولة المنشور</strong>
      </p>
      <p style="margin:0 0 18px 0; font-size:13px; line-height:1.8; color:#6B7C99;">
        طلبك <strong style="color:${BRAND_NAVY};">${escapeHtml(d.requestNumber)}</strong> اعتُمد ودخل قائمة الجدولة.
        سنبدأ التنفيذ قريباً ونبلغك فور اكتمال النشر.
      </p>
      <p style="margin:0; text-align:center;">${button('عرض الطلب', `${SITE_URL}/dashboard`)}</p>
    `),
  }
}

// 5. Payment confirmed — to client
export function paymentConfirmedToClient(d: {
  requestNumber: string
  clientName: string
  total: number
}) {
  return {
    subject: `✅ تم تأكيد دفعك · ${d.requestNumber}`,
    html: wrap(`
      ${greeting(d.clientName)}
      <p style="margin:0 0 16px 0; font-size:15px;">✅ <strong>استلمنا دفعك واعتمدناه</strong></p>
      <div style="background:#F7F4ED; border-radius:10px; padding:14px; margin-bottom:16px; font-size:13px;">
        <p style="margin:4px 0;"><strong>طلب:</strong> ${escapeHtml(d.requestNumber)}</p>
        <p style="margin:4px 0;"><strong>المبلغ:</strong> ${d.total.toLocaleString('ar-SA')} ر.س</p>
      </div>
      <p style="margin:0 0 20px 0; font-size:13px; line-height:1.8;">
        طلبك الآن في قائمة التنفيذ. سنبدأ النشر قريباً وسنخبرك فور الانتهاء.
      </p>
      <p style="margin:0; text-align:center;">${button('عرض الطلب', `${SITE_URL}/dashboard`)}</p>
    `),
  }
}

// 6. In progress — to client
export function inProgressToClient(d: {
  requestNumber: string
  clientName: string
}) {
  return {
    subject: `🚀 بدأنا تنفيذ طلبك · ${d.requestNumber}`,
    html: wrap(`
      ${greeting(d.clientName)}
      <p style="margin:0 0 16px 0; font-size:15px;">🚀 <strong>محتواك الآن قيد النشر</strong></p>
      <p style="margin:0 0 20px 0; font-size:13px; line-height:1.8;">
        فريقنا بدأ تجهيز المحتوى ونشره عبر القنوات المختارة. سنبلغك عند اكتمال التنفيذ.
      </p>
      <p style="margin:0; text-align:center;">${button('متابعة الطلب', `${SITE_URL}/dashboard`)}</p>
    `),
  }
}

// 7. Completed — to client
export function completedToClient(d: {
  requestNumber: string
  clientName: string
}) {
  return {
    subject: `🎉 اكتمل نشر طلبك · ${d.requestNumber}`,
    html: wrap(`
      ${greeting(d.clientName)}
      <div style="text-align:center; margin-bottom:18px;">
        <div style="font-size:48px;">🎉</div>
        <p style="margin:8px 0 0 0; font-size:18px; font-weight:900; color:${BRAND_GOLD};">اكتمل النشر</p>
      </div>
      <p style="margin:0 0 16px 0; font-size:14px; line-height:1.8;">
        تم نشر محتواك بنجاح — طلب <strong>${escapeHtml(d.requestNumber)}</strong> اكتمل ووصل لجمهوره المستهدف.
      </p>
      <p style="margin:0 0 20px 0; font-size:13px; line-height:1.8; color:#6B7C99;">
        شكراً لاختيارك تواصل النخبة لإيصال صوتك.
      </p>
      <p style="margin:0; text-align:center;">${button('عرض التفاصيل', `${SITE_URL}/dashboard`)}</p>
    `),
  }
}

// 8. Rejected — to client
export function rejectedToClient(d: {
  requestNumber: string
  clientName: string
  reason: string
}) {
  return {
    subject: `طلبك ${d.requestNumber} · مراجعة الإدارة`,
    html: wrap(`
      ${greeting(d.clientName)}
      <p style="margin:0 0 16px 0; font-size:14px; line-height:1.8;">
        ⚠️ <strong>بعد مراجعة طلبك، اعتذرنا عن قبوله.</strong>
      </p>
      <p style="margin:0 0 8px 0; font-size:13px; color:#6B7C99;">سبب الرفض من الإدارة:</p>
      ${note(d.reason)}
      <p style="margin:18px 0; font-size:13px; line-height:1.8;">
        يسعدنا استقبال طلب جديد منك في أي وقت. لأي استفسار، تواصل معنا.
      </p>
      <p style="margin:0; text-align:center;">${button('تقديم طلب جديد', `${SITE_URL}/request`)}</p>
    `),
  }
}

function formatReach(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return n.toString()
}
