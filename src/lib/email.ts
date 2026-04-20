import { Resend } from 'resend'

const ADMIN_EMAIL = 'first1saudi@gmail.com'

// Resend requires a verified "from" domain. Until nukhba.media is verified,
// we fall back to their sandbox sender (onboarding@resend.dev) which only
// accepts the team's own inbox as recipient in free tier — our admin email above
// must match the Resend account's verified inbox.
const FROM = process.env.RESEND_FROM_EMAIL || 'Tawasol Al-Nokhba <onboarding@resend.dev>'

export interface NewRequestEmailData {
  requestNumber: string
  clientName: string
  clientEmail: string
  clientPhone: string
  category: string
  title: string
  content: string
  channels: string[]
}

export async function sendNewRequestEmail(data: NewRequestEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY missing — skipping email notification')
    return
  }

  const resend = new Resend(apiKey)
  const CHANNEL_LABELS: Record<string, string> = { x: 'X', ig: 'Instagram', li: 'LinkedIn', tk: 'TikTok' }

  const subject = `طلب نشر جديد · ${data.requestNumber}`
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Cairo, sans-serif; direction: rtl; max-width: 560px; margin: 0 auto; padding: 24px; color: #0E2855;">
      <h1 style="color: #0E2855; font-size: 20px; margin-bottom: 8px;">📩 وصل طلب نشر جديد</h1>
      <p style="color: #6B7C99; font-size: 14px; margin-bottom: 24px;">رقم الطلب: <strong>${data.requestNumber}</strong></p>

      <div style="background: #F7F4ED; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <h2 style="font-size: 14px; margin: 0 0 12px 0; color: #C9A961;">بيانات العميل</h2>
        <p style="margin: 4px 0; font-size: 14px;"><strong>الاسم:</strong> ${escapeHtml(data.clientName)}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>البريد:</strong> ${escapeHtml(data.clientEmail)}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>الجوال:</strong> <span dir="ltr">${escapeHtml(data.clientPhone)}</span></p>
      </div>

      <div style="background: #F7F4ED; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <h2 style="font-size: 14px; margin: 0 0 12px 0; color: #C9A961;">المحتوى</h2>
        <p style="margin: 4px 0; font-size: 14px;"><strong>الفئة:</strong> ${escapeHtml(data.category)}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>العنوان:</strong> ${escapeHtml(data.title)}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>القنوات:</strong> ${data.channels.map(c => CHANNEL_LABELS[c] ?? c).join('، ')}</p>
        <p style="margin: 12px 0 4px 0; font-size: 13px; color: #6B7C99; white-space: pre-line;">${escapeHtml(data.content)}</p>
      </div>

      <a href="https://nukhba.media/admin/requests"
        style="display: inline-block; background: #0E2855; color: #C9A961; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px;">
        فتح لوحة الإدارة
      </a>

      <p style="color: #6B7C99; font-size: 12px; margin-top: 32px;">
        تواصل النخبة · Tawasol Al-Nokhba
      </p>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject,
      html,
    })
    if (error) console.error('Resend error:', error)
  } catch (err) {
    console.error('Email send exception:', err)
  }
}

function escapeHtml(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c))
}
