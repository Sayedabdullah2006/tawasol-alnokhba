import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import OrderServiceButton from '@/components/inventor-store/OrderServiceButton'
import StoreProductCard from '@/components/inventor-store/StoreProductCard'
import { formatStorePrice, getInventorStoreProduct, INVENTOR_STORE_PRODUCTS } from '@/lib/inventor-store'

export function generateStaticParams() {
  return INVENTOR_STORE_PRODUCTS.map(product => ({ slug: product.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const product = getInventorStoreProduct(slug)
  if (!product) return { title: 'الخدمة غير موجودة | مسار المخترع' }
  return { title: `${product.name} | مسار المخترع`, description: product.summary }
}

export default async function InventorStoreProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = getInventorStoreProduct(slug)
  if (!product) notFound()
  const related = INVENTOR_STORE_PRODUCTS.filter(item => item.slug !== product.slug && (item.category === product.category || item.bundle === product.bundle)).slice(0, 3)

  return (
    <div className="pb-12">
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-8 md:pt-12">
        <nav className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold text-muted"><Link href="/inventor-store" className="hover:text-green">مسار المخترع</Link><span>/</span><span>{product.categoryLabel}</span><span>/</span><span className="text-dark">{product.name}</span></nav>
        <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="glass-panel relative min-h-[390px] overflow-hidden rounded-lg p-7 md:p-10">
            <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(21,55,111,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(21,55,111,.06)_1px,transparent_1px)] [background-size:30px_30px]" />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <span className="inline-flex rounded-full border border-gold/35 bg-white/70 px-3 py-1 text-xs font-black text-dark">{product.categoryLabel}</span>
                <p className="mt-7 text-6xl font-black text-green/15">{product.icon}</p>
              </div>
              <div>
                <p className="text-sm font-black text-gold">{product.shortName}</p>
                <h1 className="mt-2 text-3xl font-black leading-tight text-dark md:text-5xl">{product.name}</h1>
                <p className="mt-4 max-w-2xl text-sm leading-8 text-muted md:text-base">{product.description}</p>
              </div>
            </div>
          </div>
          <aside className="glass-panel rounded-lg p-6 md:p-8 lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-bold text-muted">السعر النهائي</p>
            <p className="mt-1 text-4xl font-black text-green">{formatStorePrice(product.price)} <span className="text-base">ر.س</span></p>
            <div className="my-6 grid grid-cols-2 gap-3 border-y border-border/80 py-5 text-sm">
              <div><p className="text-xs text-muted">مدة التنفيذ</p><p className="mt-1 font-black text-dark">{product.duration}</p></div>
              <div><p className="text-xs text-muted">التعديلات</p><p className="mt-1 font-black text-dark">{product.revisions === 1 ? 'جولة واحدة' : `${product.revisions} جولات`}</p></div>
            </div>
            <OrderServiceButton slug={product.slug} className="w-full" />
            <p className="mt-3 text-center text-[11px] leading-5 text-muted">يتطلب تسجيل الدخول عند الطلب فقط. يخضع الطلب لمراجعة الفريق قبل بدء التنفيذ.</p>
            {product.notice && <div className="mt-4 rounded-lg border border-amber-300/70 bg-amber-50/80 p-3 text-xs leading-6 text-amber-900"><strong className="block">تنبيه مهم</strong>{product.notice}</div>}
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 lg:grid-cols-3">
        {[
          ['ماذا ستحصل عليه؟', product.deliverables],
          ['ما الذي نحتاجه منك؟', product.requirements],
          ['النتيجة المتوقعة', product.outcomes],
        ].map(([title, items]) => <article key={title as string} className="glass-panel rounded-lg p-6"><h2 className="text-lg font-black text-dark">{title as string}</h2><ul className="mt-4 space-y-3">{(items as string[]).map(item => <li key={item} className="flex gap-3 text-sm leading-7 text-muted"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />{item}</li>)}</ul></article>)}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-black text-gold">قد تناسبك أيضاً</p><h2 className="mt-1 text-2xl font-black text-dark">خدمات مرتبطة</h2></div><Link href="/inventor-store" className="text-sm font-black text-green">كل الخدمات</Link></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{related.map(item => <StoreProductCard key={item.slug} product={item} />)}</div>
      </section>
    </div>
  )
}
