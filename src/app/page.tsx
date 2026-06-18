import Link from 'next/link'
import DesignShowcase from '@/components/home/DesignShowcase'

const stats = [
  { value: '+500K', label: 'وصول شهري' },
  { value: '4', label: 'منصات' },
  { value: '24 ساعة', label: 'متوسط التنفيذ' },
  { value: '%98', label: 'رضا العملاء' },
]

const values = [
  { icon: '🌐', title: 'وصول واسع', desc: 'حضور قوي عبر X و LinkedIn و Instagram و TikTok يوصل خبرك للجمهور المناسب.' },
  { icon: '🎨', title: 'تصميم وصياغة راقية', desc: 'محتوى يليق بإنجازك بأيدي محترفين — لا قالب جاهز.' },
  { icon: '✅', title: 'أنت تعتمد قبل النشر', desc: 'لا يُنشر شيء إلا بعد موافقتك الكاملة. صفر مخاطرة على صورتك.' },
  { icon: '⚡', title: 'تنفيذ سريع', desc: 'خبرك جاهز للنشر خلال 24–48 ساعة من تأكيد الدفع.' },
  { icon: '💳', title: 'سعر فوري + تقسيط', desc: 'تسعير شفّاف يظهر فوراً، ودفع مريح عبر تمارا على 3 دفعات.' },
  { icon: '🔒', title: 'تعامل موثوق', desc: 'رُقيّ واحترافية من أول رسالة حتى نشر إنجازك بأبهى صورة.' },
]

const steps = [
  { num: '١', title: 'قدّم طلبك', desc: 'أدخل خبرك واختر باقتك — ويظهر سعرك فوراً.' },
  { num: '٢', title: 'اعتمد وادفع', desc: 'تعتمد المحتوى وتدفع بسهولة (إلكتروني · تمارا · تحويل).' },
  { num: '٣', title: 'ننشر بعد موافقتك', desc: 'نصمّم وننشر خبرك على أوسع نطاق — بعد اعتمادك.' },
]

const testimonials = [
  { name: 'أحمد', role: 'رائد أعمال', quote: 'وصل خبري لآلاف خلال يوم واحد — احترافية من أول رسالة.' },
  { name: 'نورة', role: 'أكاديمية', quote: 'التصميم فاق توقعاتي والتفاعل كان لافتاً جداً.' },
  { name: 'خالد', role: 'مهندس', quote: 'راقني أنني أعتمد المحتوى قبل النشر — ثقة كاملة.' },
  { name: 'ريم', role: 'صاحبة مشروع', quote: 'أبرزوا إنجازي بأسلوب يليق به فعلاً.' },
  { name: 'فهد', role: 'مستثمر', quote: 'أسرع وأرقى خدمة جرّبتها لإيصال خبري.' },
  { name: 'سارة', role: 'مختصة تسويق', quote: 'خدمة منظّمة وسريعة، والنتيجة تستحق كل ريال.' },
]

const faqs = [
  { q: 'كم يستغرق تنفيذ الطلب؟', a: 'عادةً خلال 24–48 ساعة من تأكيد الدفع، حسب نوع المحتوى.' },
  { q: 'هل أراجع المحتوى قبل النشر؟', a: 'نعم — لا يُنشر أي محتوى إلا بعد اعتمادك له بالكامل.' },
  { q: 'كيف يمكنني الدفع؟', a: 'دفع إلكتروني بالبطاقة، أو تقسيط عبر تمارا على 3 دفعات، أو تحويل بنكي.' },
  { q: 'هل الخدمة للأفراد أم الجهات؟', a: 'للجميع — الأفراد يحصلون على سعر فوري، والجهات على عرض مخصّص بعد المراجعة.' },
]

export default function HomePage() {
  return (
    <div className="relative bg-dark overflow-hidden">
      {/* لوحة غامرة متصلة — توهّجات محيطة تمنح إحساساً واحداً متواصلاً */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[760px] h-[760px] bg-gold/10 rounded-full blur-3xl" />
        <div className="absolute top-[820px] -right-48 w-[560px] h-[560px] bg-[#1B3D85]/50 rounded-full blur-3xl" />
        <div className="absolute top-[1700px] -left-48 w-[560px] h-[560px] bg-green/10 rounded-full blur-3xl" />
        <div className="absolute top-[2600px] -right-40 w-[520px] h-[520px] bg-gold/[0.08] rounded-full blur-3xl" />
        <div className="absolute bottom-[-120px] left-1/2 -translate-x-1/2 w-[900px] h-[560px] bg-gold/10 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* البطل */}
        <section className="max-w-5xl mx-auto px-4 pt-20 md:pt-28 pb-8 text-center">
          <p className="text-gold/80 text-xs md:text-sm font-bold tracking-[0.35em] mb-5">تواصل النخبة</p>
          <h1 className="text-4xl md:text-7xl font-black text-cream leading-[1.18] mb-6">
            إنجازك يستحق أن <span className="text-gold">يراه الجميع</span>
          </h1>
          <p className="text-cream/70 text-base md:text-xl leading-relaxed max-w-2xl mx-auto mb-9">
            نوصِل خبرك إلى أوسع جمهور سعودي، بتصميمٍ يليق بك وصياغةٍ تُلهم — وأنت تعتمد كل شيء قبل النشر.
          </p>
          <Link href="/request"
            className="inline-block px-12 py-4 bg-gold text-dark rounded-2xl text-lg font-black hover:bg-gold/90 transition-all active:scale-[0.98] shadow-2xl shadow-gold/20">
            ابدأ طلبك الآن
          </Link>
          <p className="text-cream/50 text-xs md:text-sm mt-5">لا يُنشر إلا بموافقتك · تسعير فوري · تقسيط تمارا</p>
        </section>

        {/* المعرض الحي — قلب الصفحة، ينساب من البطل */}
        <section className="py-6 md:py-10">
          <DesignShowcase />
        </section>

        {/* شريط أرقام رفيع منساب */}
        <section className="max-w-4xl mx-auto px-4 py-10">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-7 text-center">
            {stats.map(s => (
              <div key={s.label} className="min-w-[80px]">
                <div className="text-3xl md:text-5xl font-black text-gold leading-none mb-2">{s.value}</div>
                <div className="text-xs md:text-sm text-cream/60">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* سردية القيمة — منسابة بلا بطاقات مربّعة */}
        <section className="max-w-5xl mx-auto px-4 pt-14 pb-10">
          <h2 className="text-center text-2xl md:text-4xl font-black text-cream mb-12">
            لماذا <span className="text-gold">تواصل النخبة</span>؟
          </h2>
          <div className="grid sm:grid-cols-2 gap-x-14 gap-y-10">
            {values.map(v => (
              <div key={v.title} className="flex items-start gap-4">
                <div className="text-3xl leading-none shrink-0">{v.icon}</div>
                <div>
                  <h3 className="text-cream font-black text-lg mb-1.5">{v.title}</h3>
                  <p className="text-cream/60 text-sm leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* كيف نعمل — خطوات منسابة */}
        <section className="max-w-4xl mx-auto px-4 py-14">
          <h2 className="text-center text-2xl md:text-4xl font-black text-cream mb-12">كيف نعمل؟</h2>
          <div className="grid md:grid-cols-3 gap-10 md:gap-6">
            {steps.map((s, i) => (
              <div key={s.num} className="relative text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full border-2 border-gold/40 text-gold flex items-center justify-center text-2xl font-black">
                  {s.num}
                </div>
                <h3 className="text-cream font-black text-lg mb-1.5">{s.title}</h3>
                <p className="text-cream/60 text-sm leading-relaxed max-w-xs mx-auto">{s.desc}</p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-7 left-0 -translate-x-1/2 text-gold/30 text-2xl">←</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* آراء — اقتباسات منسابة بلا بطاقات ثقيلة */}
        <section className="max-w-5xl mx-auto px-4 py-14">
          <h2 className="text-center text-2xl md:text-4xl font-black text-cream mb-12">ماذا قالوا عنا؟</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
            {testimonials.map(t => (
              <div key={t.name + t.quote} className="border-t border-cream/15 pt-5">
                <div className="text-gold text-4xl leading-none mb-2">“</div>
                <p className="text-cream/85 text-sm leading-relaxed mb-4">{t.quote}</p>
                <div className="text-sm">
                  <span className="text-gold font-black">{t.name}</span>
                  <span className="text-cream/50"> — {t.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* أسئلة شائعة — منسابة على نفس اللوحة */}
        <section className="max-w-2xl mx-auto px-4 py-14">
          <h2 className="text-center text-2xl md:text-4xl font-black text-cream mb-10">قبل أن تبدأ</h2>
          <div className="divide-y divide-cream/10 border-y border-cream/10">
            {faqs.map(f => (
              <details key={f.q} className="group py-4">
                <summary className="flex items-center justify-between cursor-pointer list-none text-cream font-bold text-sm md:text-base">
                  {f.q}
                  <span className="text-gold text-xl group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-cream/60 text-sm leading-relaxed mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* الدعوة الختامية */}
        <section className="max-w-3xl mx-auto px-4 pt-10 pb-28 text-center">
          <h2 className="text-3xl md:text-5xl font-black text-cream mb-5 leading-tight">
            جاهز تترك أثراً <span className="text-gold">دائماً</span>؟
          </h2>
          <p className="text-cream/65 text-base md:text-lg mb-9">
            قدّم طلبك الآن — سعرك يظهر فوراً، وأنت تعتمد كل شيء قبل النشر.
          </p>
          <Link href="/request"
            className="inline-block px-14 py-4 bg-gold text-dark rounded-2xl text-lg font-black hover:bg-gold/90 transition-all active:scale-[0.98] shadow-2xl shadow-gold/20">
            ابدأ طلبك الآن
          </Link>
        </section>
      </div>
    </div>
  )
}
