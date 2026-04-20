import Link from 'next/link'

export const metadata = {
  title: 'الخدمات والمنتجات | تواصل النخبة',
}

const services = [
  {
    icon: '📰',
    title: 'نشر الإنجازات والأخبار',
    desc: 'انشر إنجازك أو خبرك على حسابات النخبة المؤثرة لتصل لأكبر شريحة مستهدفة بأسلوب احترافي.',
  },
  {
    icon: '🚀',
    title: 'الترويج للمنتجات والخدمات',
    desc: 'حملات نشر تسويقية للمنتجات التجارية والخدمات الاحترافية مع متابعة الأداء.',
  },
  {
    icon: '📺',
    title: 'التغطية الإعلامية',
    desc: 'تغطية موسعة للفعاليات والمؤتمرات والمنتجات بمحتوى مرئي ومكتوب جاهز للنشر.',
  },
  {
    icon: '📣',
    title: 'الحملات الترويجية المتكاملة',
    desc: 'باقة متكاملة تشمل التخطيط والتصميم والنشر والمتابعة على عدة قنوات بالتوازي.',
  },
  {
    icon: '✍️',
    title: 'المحتوى ثنائي اللغة',
    desc: 'صياغة احترافية للمحتوى بالعربية والإنجليزية للوصول لجمهور محلي ودولي.',
  },
  {
    icon: '🎬',
    title: 'إنتاج المحتوى المرئي',
    desc: 'فيديوهات قصيرة وانفوجرافيك جاهز للنشر بمعايير المنصات الاجتماعية الحديثة.',
  },
  {
    icon: '📌',
    title: 'تثبيت المنشورات',
    desc: 'تثبيت منشورك على رأس صفحة المؤثر لمدة 6 أو 12 شهراً لتعظيم الظهور.',
  },
  {
    icon: '📖',
    title: 'الموسوعة الرقمية',
    desc: 'إضافة سيرتك أو إنجازك للموسوعة الرقمية للحفاظ على أثرك المعرفي على المدى الطويل.',
  },
  {
    icon: '📊',
    title: 'تقارير الأداء',
    desc: 'تقرير تفصيلي بنتائج الحملة من حيث الوصول والتفاعل والانتشار.',
  },
]

export default function ServicesPage() {
  return (
    <div className="flex-1 bg-cream">
        <section className="bg-gradient-to-bl from-dark via-dark/95 to-green text-cream py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-3xl md:text-5xl font-black mb-4">الخدمات والمنتجات</h1>
            <p className="text-cream/70 text-base md:text-lg max-w-2xl mx-auto">
              باقة متنوعة من الحلول الإعلامية الاحترافية لإيصال رسالتك للجمهور المستهدف
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map(s => (
                <div key={s.title} className="bg-card rounded-2xl p-6 border border-border hover:shadow-lg transition-shadow">
                  <div className="text-4xl mb-3">{s.icon}</div>
                  <h2 className="text-lg font-bold text-dark mb-2">{s.title}</h2>
                  <p className="text-sm text-muted leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 text-center">
              <Link href="/request"
                className="inline-block px-8 py-4 bg-green text-white rounded-xl text-lg font-bold hover:bg-green/90 transition-all">
                ابدأ طلبك الآن
              </Link>
            </div>
          </div>
        </section>
    </div>
  )
}
