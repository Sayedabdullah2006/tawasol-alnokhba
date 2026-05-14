'use client'

type StepId =
  | 'influencer'
  | 'clientType'
  | 'category'
  | 'subOption'
  | 'details'
  | 'channels'
  | 'contact'
  | 'terms'
  | 'confirm'

const MESSAGES: Record<StepId, string> = {
  influencer: 'أهلاً، أنا محمد من تواصل النخبة 👋 — مع مين تحب تنشر اليوم؟',
  clientType: 'نتشرف نعرفك، أيش يصفك أكثر؟',
  category: 'حلو، ايش بنروّج اليوم؟ كل فئة لها أسلوبها الخاص.',
  subOption: 'لحظة وحدة — اختر تفصيل واحد بعد ونكمل.',
  details: 'احكي لي عن الخبر اللي تبغى ننشره — اكتب بحرية، نقدر نناقش التفاصيل لاحقاً.',
  channels: 'وين تحب يطلع منشورك؟ تذكر، الجمع بين منصتين يضاعف الوصول.',
  contact: 'قاربنا نخلص — نحتاج بياناتك للتواصل معك بخصوص العرض.',
  terms: 'اتفاقية بسيطة بيننا — اقرأها بسرعة (دقيقتين) وفعّل الموافقة.',
  confirm: 'كل شي تمام؟ خلّينا نراجع سوا قبل ما نرسل.',
}

interface Props {
  step: StepId
}

export default function HostBanner({ step }: Props) {
  const message = MESSAGES[step]
  if (!message) return null

  return (
    <div className="max-w-2xl mx-auto mb-5 flex items-start gap-3 px-2">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green to-gold flex items-center justify-center text-white font-black text-lg shadow-sm">
          م
        </div>
      </div>
      <div className="flex-1 relative">
        <div className="bg-white border border-border rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-dark">محمد</span>
            <span className="text-[10px] text-muted bg-cream rounded-full px-2 py-0.5">فريق تواصل النخبة</span>
          </div>
          <p className="text-sm text-dark/90 leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  )
}
