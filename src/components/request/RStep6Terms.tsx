'use client'

import { cn } from '@/lib/utils'

interface Props {
  termsAccepted: boolean
  privacyAccepted: boolean
  onTermsChange: (v: boolean) => void
  onPrivacyChange: (v: boolean) => void
}

const TERMS_TEXT = `أولاً: قبول الشروط
بتقديم طلب النشر عبر منصة تواصل النخبة، فإنك توافق على الالتزام بهذه الشروط والأحكام كاملةً.

ثانياً: طبيعة الخدمة
• المحتوى المقدم يجب أن يكون حقيقياً وموثقاً وغير مضلل.
• تحتفظ المنصة بحق رفض أي محتوى يخالف سياساتها دون إبداء الأسباب.

ثالثاً: المحتوى المحظور
• المحتوى المخالف للشريعة الإسلامية أو للأنظمة السعودية.
• المحتوى السياسي المثير للجدل.
• الادعاءات الكاذبة أو المضللة.
• انتهاك حقوق الملكية الفكرية.

رابعاً: الأسعار والدفع
• الأسعار بالريال السعودي شاملة ضريبة القيمة المضافة 15%.
• الدفع عبر التحويل البنكي قبل تنفيذ الخدمة.
• لا يُعاد المبلغ بعد نشر المحتوى.
• في حال رفض المحتوى لمخالفته الشروط، يُعاد المبلغ كاملاً خلال 3 أيام عمل.

خامساً: مواعيد التنفيذ
• يُنفَّذ النشر خلال 24–48 ساعة من التحقق من الدفع.
• لمواعيد النشر المحددة، يُرجى التنسيق المسبق.

سادساً: المسؤولية
• صاحب الطلب مسؤول قانونياً عن صحة المعلومات المقدمة.
• المنصة غير مسؤولة عن أي نزاعات ناتجة عن المحتوى.

سابعاً: الخصوصية وحفظ البيانات
• تُحفَظ بياناتك في قواعد بيانات آمنة ومحمية.
• تُستخدَم البيانات لتحسين الخدمة والتواصل المستقبلي.
• لا تُشارَك مع أطراف ثالثة دون إذن صريح منك.
• يمكنك طلب حذف بياناتك في أي وقت.`

export default function RStep6Terms({ termsAccepted, privacyAccepted, onTermsChange, onPrivacyChange }: Props) {
  return (
    <div className="wizard-enter max-w-lg mx-auto">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        اقرأ وافق للمتابعة
      </h2>
      <p className="text-sm text-muted text-center mb-6">الشروط والأحكام</p>

      <div className="bg-card rounded-2xl border border-border p-5 mb-6">
        <div className="terms-scroll max-h-[260px] overflow-y-auto text-sm text-dark/80 leading-relaxed whitespace-pre-line">
          {TERMS_TEXT}
        </div>
      </div>

      <div className="space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={e => onTermsChange(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-border accent-green cursor-pointer"
          />
          <span className="text-sm text-dark">
            أوافق على الشروط والأحكام وأتعهد بصحة المعلومات المقدمة
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={e => onPrivacyChange(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-border accent-green cursor-pointer"
          />
          <span className="text-sm text-dark">
            أوافق على حفظ بياناتي الشخصية واستخدامها وفق سياسة خصوصية منصة تواصل النخبة
          </span>
        </label>
      </div>
    </div>
  )
}
