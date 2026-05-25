'use client'

import { cn } from '@/lib/utils'

export interface CampaignSetup {
  postCount: number
  duration: string
}

const DURATIONS = [
  { id: 'week_1',  label: 'أسبوع' },
  { id: 'week_2',  label: 'أسبوعان' },
  { id: 'month_1', label: 'شهر' },
  { id: 'month_2', label: 'شهران' },
  { id: 'month_3', label: '3 أشهر' },
  { id: 'month_6', label: '6 أشهر' },
  { id: 'open',    label: 'مفتوح' },
]

interface Props {
  data: CampaignSetup
  onChange: (d: CampaignSetup) => void
}

export default function RStepCampaignSetup({ data, onChange }: Props) {
  return (
    <div className="wizard-enter max-w-lg mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-black text-dark mb-1">إعداد الحملة</h2>
        <p className="text-sm text-muted">حدّد عدد المنشورات ومدة الحملة</p>
      </div>

      {/* عدد المنشورات */}
      <div>
        <h3 className="font-bold text-dark mb-3 text-sm">عدد المنشورات</h3>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 9 }, (_, i) => i + 2).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ ...data, postCount: n })}
              className={cn(
                'h-12 rounded-xl border-2 font-black text-lg transition-all',
                data.postCount === n
                  ? 'border-green bg-green text-white shadow-md'
                  : 'border-border bg-card text-dark hover:border-green/60'
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {data.postCount >= 2 && (
          <p className="text-xs text-muted mt-2 text-center wizard-enter">
            {data.postCount} منشور — خصم <span className="font-bold text-green">30%</span> على إجمالي الأسعار
          </p>
        )}
      </div>

      {/* مدة الحملة */}
      <div>
        <h3 className="font-bold text-dark mb-1 text-sm">مدة الحملة</h3>
        <p className="text-xs text-muted mb-3">اختياري — لتحديد الجدول الزمني لنشر المنشورات</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {DURATIONS.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() =>
                onChange({ ...data, duration: data.duration === d.id ? '' : d.id })
              }
              className={cn(
                'py-2 px-3 rounded-xl border-2 text-sm font-semibold transition-all',
                data.duration === d.id
                  ? 'border-green bg-green/10 text-green-700'
                  : 'border-border bg-card text-dark hover:border-green/40'
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
