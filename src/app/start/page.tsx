import Link from 'next/link'
import DesignShowcase from '@/components/home/DesignShowcase'

export const metadata = {
  title: 'ابدأ طلبك · تواصل النخبة',
  description: 'نوصِل خبرك وإنجازك لأوسع جمهور سعودي بتصميم احترافي وصياغة تليق بك — وأنت تعتمده قبل النشر.',
}

const stats = [
  { value: '+500K', label: 'وصول شهري' },
  { value: '4', label: 'منصات اجتماعية' },
  { value: '24 ساعة', label: 'متوسط التنفيذ' },
  { value: '%98', label: 'رضا العملاء' },
]

const values = [
  { icon: '🌐', title: 'وصول واسع', desc: 'حضور قوي عبر X · LinkedIn · Instagram · TikTok يوصل خبرك للجمهور المناسب.' },
  { icon: '🎨', title: 'تصميم وصياغة راقية', desc: 'محتوى يليق بإنجازك بأيدي محترفين، لا قالب جاهز.' },
  { icon: '✅', title: 'أنت تعتمد قبل النشر', desc: 'لا يُنشر شيء إلا بعد موافقتك — صفر مخاطرة على صورتك.' },
  { icon: '⚡', title: 'تنفيذ سريع', desc: 'خبرك جاهز للنشر خلال 24–48 ساعة من تأكيد الدفع.' },
  { icon: '💳', title: 'سعر فوري + تقسيط', desc: 'تسعير شفّاف فوري، وإمكانية الدفع عبر تمارا على 3 دفعات.' },
  { icon: '🔒', title: 'موثوق واحترافي', desc: 'تعامل راقٍ من أول رسالة حتى نشر إنجازك بأبهى صورة.' },
]

const steps = [
  { num: '1', title: 'قدّم طلبك', desc: 'أدخل خبرك واختر باقتك — ويظهر لك السعر فوراً.' },
  { num: '2', title: 'اعتمد وادفع', desc: 'تعتمد المحتوى وتدفع بسهولة (إلكتروني · تمارا · تحويل).' },
  { num: '3', title: 'ننشر بعد موافقتك', desc: 'نصمّم وننشر خبرك على أوسع نطاق — بعد اعتمادك له.' },
]

const testimonials = [
  { name: 'أحمد', role: 'رائد أعمال', quote: 'وصل خبري لآلاف خلال يوم واحد — احترافية من أول رسالة.' },
  { name: 'نورة', role: 'أكاديمية', quote: 'التصميم فاق توقعاتي والتفاعل كان لافتاً جداً.' },
  { name: 'خالد', role: 'مهندس', quote: 'راقني أنني أعتمد المحتوى قبل النشر — ثقة كاملة.' },
  { name: 'ريم', role: 'صاحبة مشروع', quote: 'أبرزوا إنجازي بأسلوب يليق به فعلاً.' },
  { name: 'فهد', role: 'مستثمر', quote: 'أسرع وأرقى خدمة جرّبتها لإيصال خبري للجمهور.' },
  { name: 'سارة', role: 'مختصة تسويق', quote: 'خدمة منظّمة وسريعة، والنتيجة تستحق كل ريال.' },
]

const faqs = [
  { q: 'كم يستغرق تنفيذ الطلب؟', a: 'عادةً خلال 24–48 ساعة من تأكيد الدفع، حسب نوع المحتوى.' },
  { q: 'هل أراجع المحتوى قبل النشر؟', a: 'نعم — لا يُنشر أي محتوى إلا بعد اعتمادك له بالكامل.' },
  { q: 'كيف يمكنني الدفع؟', a: 'دفع إلكتروني بالبطاقة، أو تقسيط عبر تمارا على 3 دفعات، أو تحويل بنكي.' },
  { q: 'هل الخدمة للأفراد أم الجهات؟', a: 'للجميع — الأفراد يحصلون على سعر فوري، والجهات على عرض مخصّص بعد المراجعة.' },
]

export default function StartPage() {
  return (
    <div className="flex-1 bg-cream">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-dark via-[#0A1F45] to-[#1B3D85]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold/10 rounded-full blur-3xl" />
        <div className="relative max-w-3xl mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="text-4xl md:text-6xl font-black text-cream mb-5 leading-tight">
            إنجازك يستحق أن <span className="text-gold">يراه الجميع</span>
          </h1>
          <p className="text-cream/80 text-base md:text-lg leading-relaxed mb-8 max-w-2xl mx-auto">
            نوصِل خبرك وإنجازك إلى أوسع جمهور سعودي، بتصميمٍ احترافي وصياغةٍ تليق بك — وأنت تعتمده قبل النشر.
          </p>
          <Link href="/request"
            className="inline-block px-10 py-4 bg-gold text-dark rounded-xl text-lg font-black hover:bg-gold/90 transition-all active:scale-[0.98] shadow-lg shadow-gold/20">
            ابدأ طلبك الآن
          </Link>
          <p className="text-cream/60 text-xs md:text-sm mt-4">
            ✦ لا يُنشر إلا بعد موافقتك · تسعير فوري · تقسيط متاح
          </p>
          <div className="mt-12 md:mt-16">
            <DesignShowcase />
          </div>
        </div>
      </section>

      {/* Stats */}
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

      {/* Why us */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-gold text-sm font-bold mb-2 tracking-widest">لماذا نحن</p>
            <h2 className="text-3xl md:text-4xl font-black text-dark">لماذا تواصل النخبة؟</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {values.map(f => (
              <div key={f.title}
                className="bg-card rounded-2xl p-7 border border-border hover:shadow-xl hover:border-gold/40 transition-all group">
                <div className="text-4xl mb-4 inline-block group-hover:scale-110 transition-transform">{f.icon}</div>
                <h3 className="text-lg font-black text-dark mb-2">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Design samples */}
      <section className="py-16 bg-gradient-to-b from-card to-cream">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-gold text-sm font-bold mb-2 tracking-widest">من أعمالنا</p>
            <h2 className="text-3xl md:text-4xl font-black text-dark">نماذج من تصاميمنا</h2>
          </div>
          <DesignShowcase />
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-gold text-sm font-bold mb-2 tracking-widest">خطوات بسيطة</p>
            <h2 className="text-3xl md:text-4xl font-black text-dark">كيف نعمل؟</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

      {/* Testimonials */}
      <section className="py-20 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-gold text-sm font-bold mb-2 tracking-widest">آراء عملائنا</p>
            <h2 className="text-3xl md:text-4xl font-black text-dark">ماذا قال عملاؤنا؟</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {testimonials.map(t => (
              <div key={t.name + t.quote} className="bg-cream rounded-2xl p-6 border border-border">
                <div className="text-gold text-3xl leading-none mb-3">“</div>
                <p className="text-dark text-sm leading-relaxed mb-4">{t.quote}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-dark text-gold flex items-center justify-center font-black">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-black text-dark">{t.name}</div>
                    <div className="text-xs text-muted">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-gold text-sm font-bold mb-2 tracking-widest">أسئلة شائعة</p>
            <h2 className="text-3xl md:text-4xl font-black text-dark">قبل أن تبدأ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map(f => (
              <details key={f.q} className="group bg-card rounded-2xl border border-border p-5">
                <summary className="flex items-center justify-between cursor-pointer list-none font-bold text-dark text-sm">
                  {f.q}
                  <span className="text-gold text-xl group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-sm text-muted leading-relaxed mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-dark relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gold/10 rounded-full blur-3xl" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-cream mb-4">
            جاهز تترك أثراً <span className="text-gold">دائماً</span>؟
          </h2>
          <p className="text-cream/70 text-base mb-8">
            قدّم طلبك الآن — سعرك يظهر فوراً، وأنت تعتمد كل شيء قبل النشر.
          </p>
          <Link href="/request"
            className="inline-block px-12 py-4 bg-gold text-dark rounded-xl text-lg font-black hover:bg-gold/90 transition-all active:scale-[0.98] shadow-xl shadow-gold/20">
            ابدأ طلبك الآن
          </Link>
        </div>
      </section>
    </div>
  )
}
