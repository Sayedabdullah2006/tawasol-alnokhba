import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Run with: node --env-file=.env.local scripts/test-email.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>اختبار</title></head>
<body style="margin:0; padding:24px; background:#F7F4ED; font-family:Cairo,Arial,sans-serif; color:#0E2855;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table width="560" style="background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 8px rgba(14,40,85,0.08);">
        <tr><td style="background:#0E2855; padding:24px; text-align:center;">
          <h1 style="margin:0; color:#fff; font-size:22px; font-weight:900;">تواصل النخبة</h1>
          <p style="margin:4px 0 0 0; color:#C9A961; font-size:11px; letter-spacing:2px;">TAWASOL ALNOKHBA</p>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <p style="margin:0 0 16px 0; font-size:15px;">مرحباً 👋</p>
          <p style="margin:0 0 16px 0; font-size:14px; line-height:1.8;">
            ✅ هذه رسالة تجريبية للتأكد من نجاح إعداد إشعارات Resend عبر Supabase Edge Function.
          </p>
          <p style="margin:0 0 8px 0; font-size:13px; color:#6B7C99;">إذا وصلتك هذه الرسالة، فالنظام يعمل بشكل صحيح وستتلقى:</p>
          <ul style="font-size:13px; line-height:1.9; padding-right:20px;">
            <li>إشعار عند استلام أي طلب جديد</li>
            <li>إشعار للعميل بكل تغيير في حالة طلبه</li>
            <li>تأكيد التسعيرة، الدفع، التنفيذ، الاكتمال، أو الرفض</li>
          </ul>
          <p style="margin:20px 0 0 0; font-size:12px; color:#6B7C99; text-align:center;">
            تم الإرسال من <strong style="color:#0E2855;">Noreply@nukhba.media</strong>
          </p>
        </td></tr>
        <tr><td style="background:#F7F4ED; padding:18px; text-align:center; border-top:1px solid #E3DCC9;">
          <p style="margin:0; color:#0E2855; font-size:12px; font-weight:bold;">تواصل النخبة · Tawasol Al-Nokhba</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

console.log('Invoking send-email Edge Function...')
const { data, error } = await supabase.functions.invoke('send-email', {
  body: {
    to: 'first1saudi@gmail.com',
    subject: '✅ اختبار إشعارات تواصل النخبة',
    html,
  },
})

if (error) {
  console.error('✗ Failed:', error.message)
  if (error.context) console.error('  context:', await error.context.text?.().catch(() => error.context))
  process.exit(1)
}

console.log('✓ Edge Function returned:', JSON.stringify(data, null, 2))
process.exit(0)
