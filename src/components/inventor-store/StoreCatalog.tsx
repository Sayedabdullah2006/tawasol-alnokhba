'use client'

import { useMemo, useState } from 'react'
import StoreProductCard from './StoreProductCard'
import { INVENTOR_STORE_CATEGORIES, INVENTOR_STORE_GOALS, INVENTOR_STORE_PRODUCTS } from '@/lib/inventor-store'

export default function StoreCatalog() {
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const availableCategories = useMemo(() => {
    const populated = new Set(INVENTOR_STORE_PRODUCTS.map(product => product.category))
    return INVENTOR_STORE_CATEGORIES.filter(item => item.id === 'all' || populated.has(item.id))
  }, [])

  const products = useMemo(() => INVENTOR_STORE_PRODUCTS.filter(product => {
    const matchesCategory = category === 'all' || product.category === category
    const normalized = query.trim().toLowerCase()
    const matchesQuery = !normalized || `${product.name} ${product.summary} ${product.categoryLabel}`.toLowerCase().includes(normalized)
    return matchesCategory && matchesQuery
  }), [category, query])

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-10 md:py-14" id="store-catalog">
        <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black text-gold">ابدأ من احتياجك</p>
            <h2 className="mt-2 text-2xl font-black text-dark md:text-3xl">ما الذي يحتاجه اختراعك اليوم؟</h2>
          </div>
          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">ابحث في الخدمات</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم الخدمة أو الهدف..." className="h-12 w-full rounded-lg border border-white/80 bg-white/70 px-4 text-sm text-dark shadow-sm outline-none backdrop-blur-md transition focus:border-green/45 focus:ring-2 focus:ring-green/10" />
          </label>
        </div>

        <div className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {INVENTOR_STORE_GOALS.map((goal, index) => (
            <button key={`${goal.label}-${index}`} type="button" onClick={() => setCategory(goal.id)} className="flex min-h-20 items-center gap-3 rounded-lg border border-border/80 bg-white/55 p-3 text-right transition hover:border-gold/45 hover:bg-white/80">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-green/10 text-[10px] font-black text-green">{goal.icon}</span>
              <span className="text-sm font-black leading-6 text-dark">{goal.label}</span>
            </button>
          ))}
        </div>

        <div className="mb-7 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {availableCategories.map(item => (
            <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${category === item.id ? 'border-green bg-green text-white' : 'border-border bg-white/60 text-dark hover:border-green/35'}`}>
              {item.label}
            </button>
          ))}
        </div>

        {products.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map(product => <StoreProductCard key={product.slug} product={product} />)}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-white/50 px-5 py-14 text-center">
            <p className="font-black text-dark">لم نجد خدمة مطابقة</p>
            <button type="button" onClick={() => { setQuery(''); setCategory('all') }} className="mt-3 text-sm font-bold text-green">عرض كل الخدمات</button>
          </div>
        )}
      </section>
    </>
  )
}
