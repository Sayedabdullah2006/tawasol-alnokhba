import type { Metadata } from 'next'
import Link from 'next/link'
import StoreCatalog from '@/components/inventor-store/StoreCatalog'
import { INVENTOR_STORE_PRODUCTS } from '@/lib/inventor-store'

export const metadata: Metadata = {
  title: 'مسار المخترع | تواصل النخبة',
  description: 'متجر خدمات رقمية تساعد المخترعين على شرح اختراعاتهم وعرضها وتسويقها باحتراف.',
}

const featured = INVENTOR_STORE_PRODUCTS.filter(product => product.featured).slice(0, 3)

export default function InventorStorePage() {
  return (
    <div className="relative overflow-hidden pb-10">
      <section className="mx-auto max-w-6xl px-4 pb-5 pt-8 md:pt-12">
        <div className="glass-panel relative min-h-[540px] overflow-hidden rounded-lg md:min-h-[460px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/inventor-store-hero.webp" alt="مخترع يطوّر نموذجاً عملياً في استديو هندسي" className="absolute inset-0 h-full w-full object-cover object-[32%_center] md:object-center" />
          <div className="absolute inset-0 bg-[linear-gradient(to_left,rgba(247,250,253,.99)_0%,rgba(247,250,253,.94)_32%,rgba(247,250,253,.64)_53%,rgba(247,250,253,.08)_78%)] max-md:bg-[linear-gradient(to_bottom,rgba(247,250,253,.04)_0%,rgba(247,250,253,.38)_38%,rgba(247,250,253,.96)_62%,rgba(247,250,253,.99)_100%)]" />
          <div className="relative z-10 flex min-h-[540px] items-end p-6 sm:p-8 md:min-h-[460px] md:items-center md:p-10 lg:p-12">
            <div className="w-full max-w-[33rem] md:ml-auto md:pr-3 lg:pr-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-gold/40 bg-white/75 px-3 py-1 text-xs font-black text-dark backdrop-blur-md">مسار المخترع</span>
                <span className="text-xs font-bold text-green">من تواصل النخبة</span>
              </div>
              <h1 className="text-4xl font-black leading-[1.25] text-dark sm:text-5xl md:text-[3.25rem]">فكرتك تستحق عرضاً <span className="text-gold">يليق بها</span></h1>
              <p className="mt-5 max-w-lg text-base leading-8 text-muted">خدمات رقمية متخصصة تساعدك على شرح اختراعك، والاستعداد للعرض، وبناء حضور احترافي يبرز قيمته.</p>
              <div className="mt-7">
                <a href="#store-catalog" className="rounded-lg bg-green px-6 py-3 text-sm font-black text-white shadow-lg shadow-green/20 transition hover:bg-green/90">تصفح الخدمات</a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-dark/70">
                <span>تصفح دون تسجيل</span><span>سعر ومخرجات واضحة</span><span>متابعة حتى الاعتماد</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-3 md:grid-cols-3">
          {featured.map((product, index) => (
            <Link key={product.slug} href={`/inventor-store/${product.slug}`} className="glass-panel group flex items-center gap-4 rounded-lg p-4 transition hover:-translate-y-0.5 hover:border-gold/40">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-green/10 text-sm font-black text-green">0{index + 1}</span>
              <div className="min-w-0"><p className="text-xs font-bold text-gold">الأكثر طلباً</p><h2 className="truncate font-black text-dark">{product.name}</h2></div>
              <span className="mr-auto text-xl text-green transition group-hover:-translate-x-1">←</span>
            </Link>
          ))}
        </div>
      </section>

      <StoreCatalog />

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <div className="glass-panel rounded-lg p-6 md:p-8">
            <p className="text-xs font-black text-gold">كيف تعمل الخدمة؟</p>
            <h2 className="mt-2 text-2xl font-black text-dark">رحلة قصيرة، ومخرجات محددة</h2>
            <ol className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ['1', 'اختر الخدمة', 'راجع المخرجات والمتطلبات والسعر دون تسجيل.'],
                ['2', 'أرسل التفاصيل', 'سجّل دخولك وارفع صور الاختراع ووثائقه بصورة منفصلة.'],
                ['3', 'تابع التنفيذ', 'تصل التحديثات والمراجعات إلى حسابك حتى الاعتماد.'],
              ].map(item => <li key={item[0]} className="rounded-lg border border-border/70 bg-white/55 p-4"><span className="text-2xl font-black text-gold">{item[0]}</span><h3 className="mt-3 font-black text-dark">{item[1]}</h3><p className="mt-1 text-xs leading-6 text-muted">{item[2]}</p></li>)}
            </ol>
          </div>
          <div className="glass-panel-dark rounded-lg p-6 text-white md:p-8">
            <p className="text-xs font-black text-gold">لديك احتياج مركّب؟</p>
            <h2 className="mt-3 text-2xl font-black">الحزم تجمع موادك في قصة واحدة</h2>
            <p className="mt-3 text-sm leading-7 text-white/70">اختر حزمة متكاملة عندما تحتاج إلى عرض وتصميم وحضور رقمي برسالة وهوية متسقتين.</p>
            <a href="#store-catalog" className="mt-6 inline-flex rounded-lg bg-gold px-5 py-3 text-sm font-black text-dark">استعرض الحزم</a>
          </div>
        </div>
      </section>
    </div>
  )
}
