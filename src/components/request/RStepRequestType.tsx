'use client'

import { cn } from '@/lib/utils'

export type RequestType = 'single' | 'campaign'

interface Props {
  selected: RequestType | null
  onSelect: (v: RequestType) => void
}

export default function RStepRequestType({ selected, onSelect }: Props) {
  return (
    <div className="wizard-enter max-w-lg mx-auto">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        ما نوع الطلب؟
      </h2>
      <p className="text-sm text-muted text-center mb-6">
        اختر بين منشور واحد أو حملة متعددة المنشورات
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* منشور واحد */}
        <button
          type="button"
          onClick={() => onSelect('single')}
          className={cn(
            'p-6 rounded-2xl border-2 text-center transition-all cursor-pointer',
            'hover:shadow-md active:scale-[0.98]',
            selected === 'single'
              ? 'border-green bg-green/5 shadow-md'
              : 'border-border bg-card'
          )}
        >
          <div className="text-4xl mb-3">📄</div>
          <h3 className="font-bold text-dark">منشور واحد</h3>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            خبر واحد تريد نشره — مثالي إذا كان لديك إنجاز منفرد تودّ إيصاله
          </p>
        </button>

        {/* حملة */}
        <button
          type="button"
          onClick={() => onSelect('campaign')}
          className={cn(
            'relative p-6 rounded-2xl border-2 text-center transition-all cursor-pointer overflow-hidden',
            'hover:shadow-md active:scale-[0.98]',
            selected === 'campaign'
              ? 'border-green bg-green/5 shadow-md'
              : 'border-border bg-card'
          )}
        >
          <div className="absolute top-3 left-3 bg-green text-white text-xs font-black px-2 py-0.5 rounded-full">
            وفّر 30%
          </div>
          <div className="text-4xl mb-3">🚀</div>
          <h3 className="font-bold text-dark">حملة متعددة</h3>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            أكثر من منشور لك أو لمجموعتك — سواء كنت وزملاؤك فزتم في نفس المسابقة، أو لديك أنت عدة أخبار تستحق النشر. خصم 30% على الإجمالي
          </p>
        </button>
      </div>

      {selected === 'campaign' && (
        <div className="mt-5 bg-green/5 border border-green/20 rounded-xl px-4 py-3 text-center text-sm text-green-700 wizard-enter">
          <span className="text-base">🎉</span>{' '}
          اخترت الحملة — ستوفر <strong>30%</strong> على إجمالي أسعار المنشورات
        </div>
      )}

      {selected === 'single' && (
        <div className="mt-5 bg-green/5 border border-green/20 rounded-xl px-4 py-2 text-center text-sm text-green-700 wizard-enter">
          <span className="text-base">✓</span> تمام — سنكمل إعداد منشور واحد مخصص لك
        </div>
      )}
    </div>
  )
}
