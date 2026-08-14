import Link from 'next/link'
import { formatStorePrice, type InventorStoreProduct } from '@/lib/inventor-store'

export default function StoreProductCard({ product }: { product: InventorStoreProduct }) {
  return (
    <article className="group flex min-h-[22rem] flex-col overflow-hidden rounded-lg border border-white/75 bg-white/70 shadow-[0_14px_36px_rgba(16,43,92,0.08)] backdrop-blur-md transition duration-200 hover:-translate-y-1 hover:border-gold/45 hover:shadow-[0_18px_42px_rgba(16,43,92,0.13)]">
      <div className="relative flex min-h-36 items-end overflow-hidden border-b border-border/70 bg-[#edf3f8] p-5">
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(21,55,111,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(21,55,111,.07)_1px,transparent_1px)] [background-size:26px_26px]" />
        <span className="absolute left-5 top-5 text-5xl font-black text-green/12">{product.icon}</span>
        <div className="relative">
          <span className="inline-flex rounded-full border border-gold/30 bg-white/75 px-2.5 py-1 text-[11px] font-black text-dark">{product.categoryLabel}</span>
          <h2 className="mt-3 text-xl font-black leading-8 text-dark">{product.name}</h2>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="line-clamp-3 text-sm leading-7 text-muted">{product.summary}</p>
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold text-dark/70">
          <span className="rounded-md bg-cream px-2.5 py-1.5">{product.duration}</span>
          <span className="rounded-md bg-cream px-2.5 py-1.5">{product.revisions === 1 ? 'تعديل واحد' : `${product.revisions} تعديلات`}</span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          <div>
            <p className="text-[11px] text-muted">السعر</p>
            <p className="text-2xl font-black text-green">{formatStorePrice(product.price)} <span className="text-sm">ر.س</span></p>
          </div>
          <Link href={`/inventor-store/${product.slug}`} className="rounded-md border border-green/35 bg-white/70 px-4 py-2.5 text-sm font-black text-green transition group-hover:bg-green group-hover:text-white">
            عرض التفاصيل
          </Link>
        </div>
      </div>
    </article>
  )
}
