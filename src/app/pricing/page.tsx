import Link from 'next/link'

export const metadata = {
  title: 'الأسعار | تواصل النخبة',
}

const tiers = [
  {
    name: 'الباقة الأساسية',
    startsFrom: 400,
    blurb: 'مناسبة للمبادرات الفردية والمحتوى البسيط',
    features: [
      'منشور على قناة واحدة',
      'صياغة احترافية للمحتوى',
      'صورة واحدة جاهزة للنشر',
      'تنفيذ خلال 24–48 ساعة',
    ],
  },
  {
    name: 'الباقة الاحترافية',
    startsFrom: 1500,
    blurb: 'الأنسب للأفراد والشركات الناشئة',
    highlighted: true,
    features: [
      'نشر على عدة قنوات',
      'محتوى ثنائي اللغة',
      'مجموعة صور احترافية',
      'تثبيت قصير + إعادة نشر',
    ],
  },
  {
    name: 'الباقة المتقدمة',
    startsFrom: 3000,
    blurb: 'للحملات الكبرى والظهور الإعلامي الواسع',
    features: [
      'حملة متكاملة على جميع القنوات',
      'محتوى مرئي + انفوجرافيك',
      'تثبيت طويل + موسوعة رقمية',
      'تقرير أداء تفصيلي',
    ],
  },
]

export default function PricingPage() {
  return (
    <div className="flex-1 bg-cream">
        <section className="bg-gradient-to-bl from-dark via-dark/95 to-green text-cream py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-3xl md:text-5xl font-black mb-4">الأسعار</h1>
            <p className="text-cream/70 text-base md:text-lg max-w-2xl mx-auto">
              خدماتنا تبدأ من <span className="font-black text-cream">400 ر.س</span> — يُحدَّد السعر النهائي حسب طبيعة المحتوى، عدد القنوات، والخدمات الإضافية المطلوبة
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {tiers.map(t => (
                <div key={t.name}
                  className={`rounded-2xl p-6 border-2 transition-all ${
                    t.highlighted
                      ? 'bg-card border-green shadow-lg md:scale-[1.03]'
                      : 'bg-card border-border hover:border-green/40'
                  }`}>
                  {t.highlighted && (
                    <div className="text-xs font-bold text-green bg-green/10 inline-block px-3 py-1 rounded-full mb-3">
                      الأكثر طلباً
                    </div>
                  )}
                  <h2 className="text-xl font-black text-dark mb-1">{t.name}</h2>
                  <p className="text-xs text-muted mb-5">{t.blurb}</p>
                  <div className="mb-5">
                    <div className="text-xs text-muted">تبدأ من</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-gold">{t.startsFrom.toLocaleString('ar-SA')}</span>
                      <span className="text-sm text-muted">ر.س</span>
                    </div>
                    <div className="text-xs text-muted">شامل ضريبة القيمة المضافة</div>
                  </div>
                  <ul className="space-y-2 mb-6 text-sm text-dark">
                    {t.features.map(f => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="text-green mt-0.5">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/request"
                    className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${
                      t.highlighted
                        ? 'bg-green text-white hover:bg-green/90'
                        : 'border-2 border-green text-green hover:bg-green/5'
                    }`}>
                    اطلب تسعيرة
                  </Link>
                </div>
              ))}
            </div>

            <div className="mt-12 bg-card border border-border rounded-2xl p-6 max-w-3xl mx-auto text-center">
              <div className="text-3xl mb-3">💬</div>
              <h3 className="font-bold text-dark text-lg mb-2">السعر النهائي يحدده فريقنا بعد مراجعة الطلب</h3>
              <p className="text-sm text-muted leading-relaxed">
                بعد إرسال طلبك، يقوم فريق تواصل النخبة بمراجعة المحتوى وإرسال عرض سعر مخصص يناسب طبيعة المحتوى والقنوات المختارة.
                يمكنك بعدها إضافة الخدمات الاختيارية لرفع مستوى الحملة، وكل خدمة تضاف يظهر أمامك أثرها على السعر والوصول المتوقع.
              </p>
              <Link href="/request"
                className="inline-block mt-4 px-6 py-3 bg-green text-white rounded-xl text-sm font-bold hover:bg-green/90 transition-all">
                ابدأ طلبك الآن
              </Link>
            </div>
          </div>
        </section>
    </div>
  )
}
