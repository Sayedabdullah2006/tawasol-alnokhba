'use client'

import { useState } from 'react'
import MembershipPlansDialog from './MembershipPlansDialog'

export default function MembershipTeaser({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact
          ? 'group relative w-full overflow-hidden rounded-lg border border-gold/40 bg-dark px-4 py-4 text-right text-white shadow-lg'
          : 'group relative min-h-[31rem] w-full overflow-hidden rounded-lg border border-white/20 bg-dark p-6 text-right text-white shadow-2xl'}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gold" />
        <span
          aria-label="جديد"
          className="absolute -left-9 top-5 z-10 w-32 -rotate-45 bg-gold py-1.5 text-center text-[11px] font-black text-dark shadow-md"
        >
          جديد
        </span>
        <div className={compact ? 'flex items-center justify-between gap-4' : 'flex h-full flex-col'}>
          <div>
            <span className="inline-flex rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-black text-gold">للعملاء المستمرين</span>
            <h2 className={compact ? 'mt-2 pl-12 text-lg font-black' : 'mt-5 text-3xl font-black leading-[1.45]'}>هل ترغب بعضوية تضمن لك حضوراً مستمراً؟</h2>
            {!compact && <p className="mt-3 text-sm leading-7 text-white/70">اختر عضوية تمنحك رصيد نشر مرناً ومزايا تعزّز حضور إنجازاتك ومنتجاتك طوال مدة الاشتراك.</p>}
          </div>

          {!compact && (
            <div className="my-7 space-y-4 border-y border-white/10 py-6">
              <div><strong className="block text-2xl text-gold">رصيد طوال المدة</strong><span className="text-xs text-white/60">استخدمه وقت ما يناسبك قبل انتهاء العضوية</span></div>
              <div><strong className="block text-base">4 باقات مرنة</strong><span className="text-xs text-white/60">فضية، ذهبية، بلاتينية، وللشركات</span></div>
              <div><strong className="block text-base">تعزيز وحملات وخطط تسويق</strong><span className="text-xs text-white/60">بحسب الباقة المختارة</span></div>
              <div><strong className="block text-base">عقد واضح وتقارير رصيد</strong><span className="text-xs text-white/60">كل طلب واستهلاك موثق في حسابك</span></div>
            </div>
          )}

          <span className={compact ? 'shrink-0 rounded-lg bg-gold px-4 py-2 text-xs font-black text-dark' : 'mt-auto flex w-full items-center justify-between rounded-lg bg-gold px-4 py-3 font-black text-dark transition group-hover:bg-[#d8bd7c]'}>
            <span>اكتشف العضويات</span><span aria-hidden>←</span>
          </span>
        </div>
      </button>
      <MembershipPlansDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
