import Link from 'next/link'

const features = [
  { icon: '🎯', title: 'وصول واسع', desc: 'أكثر من نصف مليون متابع حقيقي عبر شبكة مؤثرين مميزين' },
  { icon: '✍️', title: 'محتوى احترافي', desc: 'صياغة باللغتين العربية والإنجليزية' },
  { icon: '⚡', title: 'تنفيذ سريع', desc: 'النشر خلال 24–48 ساعة من تأكيد الدفع' },
  { icon: '📊', title: 'نتائج موثقة', desc: 'تقارير أداء تفصيلية عند الطلب' },
]

const steps = [
  { num: '1', title: 'اختر المؤثر', desc: 'حدد المؤثر المناسب لمحتواك من قائمة النخبة' },
  { num: '2', title: 'قدّم طلبك', desc: 'أدخل تفاصيل المحتوى والقنوات وأرسل الطلب' },
  { num: '3', title: 'استلم عرض السعر', desc: 'فريقنا يراجع طلبك ويرسل تسعيرة مخصصة' },
  { num: '4', title: 'ادفع وانطلق', desc: 'بعد تأكيد الدفع، ينطلق محتواك للجمهور' },
]

const stats = [
  { value: '500K+', label: 'متابع حقيقي' },
  { value: '4', label: 'منصات اجتماعية' },
  { value: '24h', label: 'وقت الاستجابة' },
  { value: '100%', label: 'محتوى احترافي' },
]

export default function HomePage() {
  return (
    <div className="flex-1 bg-cream">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-dark via-[#0A1F45] to-[#1B3D85]" />
        {/* Subtle gold glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold/10 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 py-20 md:py-32 grid md:grid-cols-2 gap-10 items-center">
          <div className="text-right order-2 md:order-1">
            <div className="inline-flex items-center gap-2 bg-gold/15 border border-gold/30 text-gold text-xs font-bold px-4 py-2 rounded-full mb-5">
              <span>★</span>
              <span>منصة النخبة الإعلامية</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-cream mb-5 leading-tight">
              اترك أثراً <span className="text-gold">دائماً</span>
            </h1>
            <p className="text-base md:text-lg text-cream/80 mb-8 leading-relaxed">
              منصة <span className="text-gold font-bold">تواصل النخبة</span> لنشر أخبارك وإنجازاتك ومنتجاتك عبر أبرز المؤثرين في المملكة العربية السعودية،
              لأكثر من نصف مليون متابع حقيقي.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/request"
                className="px-8 py-4 bg-gold text-dark rounded-xl text-base font-black hover:bg-gold/90 transition-all active:scale-[0.98] shadow-lg shadow-gold/20">
                ابدأ طلبك الآن
              </Link>
              <Link href="/services"
                className="px-8 py-4 bg-cream/10 backdrop-blur border border-cream/30 text-cream rounded-xl text-base font-bold hover:bg-cream/20 transition-all">
                تعرّف على خدماتنا
              </Link>
            </div>
          </div>

          {/* Logo showcase */}
          <div className="order-1 md:order-2 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gold/20 rounded-full blur-3xl scale-90" />
              <div className="relative bg-cream/95 rounded-3xl p-8 shadow-2xl flex items-center justify-center w-64 h-64 md:w-80 md:h-80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="تواصل النخبة"
                  className="w-full h-auto object-contain" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map(s => (
            <div key={s.label} className="text-center">
              <div className="text-3xl md:text-4xl font-black text-gold mb-1">{s.value}</div>
              <div className="text-xs md:text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Us */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-gold text-sm font-bold mb-2 tracking-widest">لماذا نحن</p>
            <h2 className="text-3xl md:text-4xl font-black text-dark">لماذا تواصل النخبة؟</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(f => (
              <div key={f.title}
                className="bg-card rounded-2xl p-7 border border-border text-center hover:shadow-xl hover:border-gold/40 transition-all group">
                <div className="text-5xl mb-4 inline-block group-hover:scale-110 transition-transform">{f.icon}</div>
                <h3 className="text-lg font-black text-dark mb-2">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-gradient-to-b from-card to-cream relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
        <div className="max-w-5xl mx-auto px-4 relative">
          <div className="text-center mb-12">
            <p className="text-gold text-sm font-bold mb-2 tracking-widest">خطوات بسيطة</p>
            <h2 className="text-3xl md:text-4xl font-black text-dark">كيف يعمل؟</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <div key={s.num} className="relative text-center">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-gold/20 rounded-full blur-xl" />
                  <div className="relative w-16 h-16 bg-gradient-to-br from-dark to-[#1B3D85] text-gold rounded-full flex items-center justify-center text-2xl font-black border-2 border-gold/30">
                    {s.num}
                  </div>
                </div>
                <h3 className="text-lg font-black text-dark mb-2">{s.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{s.desc}</p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-0 -translate-x-1/2 text-gold/40 text-3xl">←</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-dark relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gold/10 rounded-full blur-3xl" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-cream mb-4">
            جاهز لإيصال صوتك للجمهور؟
          </h2>
          <p className="text-cream/70 text-base mb-8">
            انضم لمئات العملاء الذين اختاروا تواصل النخبة لنشر إنجازاتهم
          </p>
          <Link href="/request"
            className="inline-block px-10 py-4 bg-gold text-dark rounded-xl text-lg font-black hover:bg-gold/90 transition-all active:scale-[0.98] shadow-xl shadow-gold/20">
            قدّم طلبك الآن
          </Link>
        </div>
      </section>
    </div>
  )
}
