import { SINGLE_PACKAGES } from '@/lib/individual-packages'
import Link from 'next/link'

export const metadata = {
  title: 'الأسعار | تواصل النخبة',
}

const tiers = SINGLE_PACKAGES.map(pkg => ({ ...pkg, startsFrom: pkg.fixedPrice ?? 499 + pkg.surcharge }))

export default function PricingPage() {
  return (
    <div className="flex-1 bg-cream">
        <section className="bg-gradient-to-bl from-dark via-dark/95 to-green text-cream py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-3xl md:text-5xl font-black mb-4">الأسعار</h1>
            <p className="text-cream/70 text-base md:text-lg max-w-2xl mx-auto">
              باقات الأفراد تبدأ من <span className="font-black text-cream">499 ر.س</span> — اختر نوع الخبر لمعرفة سعر الباقة. إطلاق المنتج أو الموقع أو التطبيق يبدأ من 3,000 ر.س للباقة الأساسية.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
                  <span className="mb-4 inline-flex items-center gap-1 rounded-lg border border-pink-200 bg-pink-50 px-2 py-1 text-[10px] font-bold text-pink-600">
                    ميزانية الإعلان مشمولة إن وجدت
                  </span>
                  <div className="mb-5">
                    <div className="text-xs text-muted">تبدأ من</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-gold">{t.startsFrom.toLocaleString('ar-SA')}</span>
                      <span className="text-sm text-muted">ر.س</span>
                    </div>
                    <div className="text-xs text-muted">السعر النهائي للخدمة</div>
                  </div>
                  <ul className="space-y-2 mb-6 text-sm text-dark">
                    {t.features.map(f => {
                      const isSponsored = f.includes('مموّل')
                      return (
                        <li
                          key={f}
                          className={
                            isSponsored
                              ? 'flex items-start gap-2 font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1.5'
                              : 'flex items-start gap-2'
                          }
                        >
                          <span className={isSponsored ? 'mt-0.5' : 'text-green mt-0.5'}>{isSponsored ? '📣' : '✓'}</span>
                          <span>{f}</span>
                        </li>
                      )
                    })}
                  </ul>
                  <Link href="/request"
                    className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${
                      t.highlighted
                        ? 'bg-green text-white hover:bg-green/90'
                        : 'border-2 border-green text-green hover:bg-green/5'
                    }`}>
                    اختر نوع خبرك
                  </Link>
                </div>
              ))}
            </div>

            <div className="mt-12 bg-card border border-border rounded-2xl p-6 max-w-3xl mx-auto text-center">
              <div className="text-3xl mb-3">💬</div>
              <h3 className="font-bold text-dark text-lg mb-2">سعر واضح حسب نوع الخبر والباقة</h3>
              <p className="text-sm text-muted leading-relaxed">
                سعر الباقة الأساسية يعتمد على نوع خبرك. الانتشار يضيف 400 ريال، والظهور المتكامل 1,400 ريال، والنخبة 2,800 ريال. الحضور المهني بسعر مستقل 1,799 ريال.
                الإنتاج من مواد العميل، والتصوير الميداني والترجمة خارج النطاق. فئة «أخرى» والجهات تحتاج عرض سعر. يظهر الإجمالي المعتمد قبل الدفع.
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
