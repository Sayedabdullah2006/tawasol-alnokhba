import Link from 'next/link'

const stats = [
  { value: '+500K', label: 'وصول شهري' },
  { value: '4', label: 'منصات نشر' },
  { value: '24 ساعة', label: 'متوسط التنفيذ' },
  { value: '98%', label: 'رضا العملاء' },
]

const values = [
  { icon: '◎', title: 'وصول واسع', desc: 'حضور قوي عبر X وLinkedIn وInstagram وTikTok يصل بخبرك للجمهور المناسب.' },
  { icon: '✦', title: 'صياغة وتصميم راقيان', desc: 'محتوى مصمم بعناية يليق بالإنجاز، لا قالب جاهز يتكرر على الجميع.' },
  { icon: '✓', title: 'اعتمادك قبل النشر', desc: 'لا يُنشر شيء إلا بعد مراجعتك واعتمادك الكامل للمحتوى والتصميم.' },
  { icon: '↗', title: 'تنفيذ واضح وسريع', desc: 'يتحول خبرك إلى خطة نشر جاهزة خلال 24 إلى 48 ساعة من تأكيد الدفع.' },
]

const testimonials = [
  { name: 'أحمد', role: 'رائد أعمال', quote: 'وصل خبري لآلاف خلال يوم واحد، وكنت متابعاً لكل تفصيلة حتى لحظة النشر.' },
  { name: 'نورة', role: 'أكاديمية', quote: 'التصميم فاق توقعاتي والتعامل كان منظماً وواضحاً من البداية.' },
  { name: 'خالد', role: 'مهندس', quote: 'فكرة أن أعتمد المحتوى قبل النشر أعطتني ثقة كاملة في التجربة.' },
]

const faqs = [
  { q: 'كم يستغرق تنفيذ الطلب؟', a: 'عادة خلال 24 إلى 48 ساعة من تأكيد الدفع، بحسب نوع المحتوى وحجم الحملة.' },
  { q: 'هل أراجع المحتوى قبل النشر؟', a: 'نعم، لا يُنشر أي محتوى قبل اعتمادك النهائي.' },
  { q: 'كيف يمكنني الدفع؟', a: 'يمكنك الدفع بالبطاقة أو عبر تمارا أو بالتحويل البنكي.' },
]

export default function HomePage() {
  return (
    <div className="relative overflow-hidden pb-12">
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-8 pt-12 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pb-14 md:pt-20">
        <div className="glass-panel order-2 rounded-lg p-6 sm:p-9 md:order-1">
          <span className="inline-flex rounded-full border border-gold/35 bg-gold/10 px-3 py-1 text-xs font-black text-dark">إعلان وتسويق يليق بالإنجاز</span>
          <h1 className="mt-5 text-4xl font-black leading-tight text-dark sm:text-5xl md:text-6xl">
            إنجازك يستحق أن <span className="text-gold">يراه الجميع</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-muted sm:text-lg">
            نحول خبرك إلى محتوى وتصميم وخطة نشر متكاملة، وتبقى أنت صاحب القرار قبل وصوله إلى الجمهور.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/request" className="rounded-lg bg-green px-6 py-3 text-sm font-black text-white shadow-lg shadow-green/20 transition hover:bg-green/90 sm:text-base">ابدأ طلبك الآن</Link>
            <Link href="/services" className="rounded-lg border border-green/35 bg-white/50 px-6 py-3 text-sm font-bold text-green backdrop-blur-sm transition hover:bg-white/80 sm:text-base">استكشف الخدمات</Link>
          </div>
        </div>

        <div className="glass-panel relative order-1 min-h-[300px] overflow-hidden rounded-lg p-2 md:order-2 md:min-h-[430px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing-media-story.png" alt="صانعة محتوى سعودية تعمل على إعداد قصة إعلامية لإنجاز مهني" className="h-full min-h-[284px] w-full rounded-md object-cover object-center md:min-h-[414px]" />
          <div className="absolute inset-x-5 bottom-5 rounded-lg border border-white/40 bg-dark/75 px-4 py-3 text-white backdrop-blur-md">
            <p className="text-xs font-black text-gold">من الإنجاز إلى الحضور</p>
            <p className="mt-1 text-xs leading-5 text-white/80">صياغة احترافية، تصميم متقن، ونشر يصل إلى جمهوره.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="glass-panel grid rounded-lg p-4 sm:grid-cols-2 md:grid-cols-4 md:p-5">
          {stats.map((stat, index) => (
            <div key={stat.label} className={`px-4 py-4 text-center ${index > 0 ? 'border-t border-border/70 sm:border-r sm:border-t-0' : ''}`}>
              <p className="text-2xl font-black text-green sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs font-medium text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold text-gold">تجربة واضحة من أول خطوة</p><h2 className="mt-2 text-2xl font-black text-dark md:text-3xl">لماذا تواصل النخبة؟</h2></div>
          <p className="max-w-md text-sm leading-6 text-muted">كل ما تحتاجه لإظهار إنجازك بوضوح، دون تعقيد في الطلب أو الاعتماد أو النشر.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {values.map(value => (
            <article key={value.title} className="glass-panel rounded-lg p-5 transition-transform duration-200 hover:-translate-y-1">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-green/10 text-xl font-black text-green">{value.icon}</span>
              <h3 className="mt-5 text-base font-black text-dark">{value.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{value.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 md:grid-cols-[0.9fr_1.1fr]">
        <div className="glass-panel rounded-lg p-6 md:p-8">
          <p className="text-xs font-bold text-gold">من تجربة عملائنا</p>
          <h2 className="mt-2 text-2xl font-black text-dark">نتائج يلمسها أصحاب الإنجازات</h2>
          <div className="mt-6 space-y-4">
            {testimonials.map(testimonial => (
              <blockquote key={testimonial.name} className="border-r-2 border-gold/60 pr-4">
                <p className="text-sm leading-7 text-dark/80">{testimonial.quote}</p>
                <footer className="mt-2 text-xs font-bold text-muted">{testimonial.name} <span className="font-normal">· {testimonial.role}</span></footer>
              </blockquote>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-lg p-6 md:p-8">
          <p className="text-xs font-bold text-gold">إجابات سريعة</p>
          <h2 className="mt-2 text-2xl font-black text-dark">قبل أن تبدأ</h2>
          <div className="mt-4 divide-y divide-border/70">
            {faqs.map(faq => (
              <details key={faq.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-dark"><span>{faq.q}</span><span className="text-lg text-gold transition-transform group-open:rotate-45">+</span></summary>
                <p className="mt-3 text-sm leading-7 text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-8">
        <div className="glass-panel-dark rounded-lg px-6 py-10 text-center sm:px-12">
          <h2 className="text-3xl font-black text-white sm:text-4xl">جاهز تترك أثراً دائماً؟</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/70">قدّم طلبك الآن، وتابع كل مرحلة من الصياغة إلى الاعتماد ثم النشر.</p>
          <Link href="/request" className="mt-7 inline-flex rounded-lg bg-gold px-7 py-3 text-sm font-black text-dark shadow-lg shadow-black/20 transition hover:bg-gold/90">ابدأ طلبك الآن</Link>
        </div>
      </section>
    </div>
  )
}
