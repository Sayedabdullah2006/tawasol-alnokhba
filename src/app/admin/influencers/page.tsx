'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { formatNumberShort } from '@/lib/utils'
import { CATEGORIES, EXTRAS } from '@/lib/constants'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Modal from '@/components/ui/Modal'

const emptyForm = {
  name_ar: '', name_en: '', x_handle: '', x_followers: 0,
  ig_handle: '', ig_followers: 0, li_handle: '', li_followers: 0,
  tk_handle: '', tk_followers: 0, bio: '', price_multiplier: 1.0,
}

interface PricingData {
  base_prices: Record<string, number>
  extras_prices: Record<string, number>
  scope_multipliers: { single: number; all: number }
  image_multipliers: { one: number; multi: number }
  discount_table: Record<string, number>
  max_discount: number
  vat_rate: number
}

const defaultPricing: PricingData = {
  base_prices: { inventions: 3000, competitions: 3000, books: 1200, events: 2500, certs: 800, graduation: 600, appointment: 1500, award: 2000, cv: 900, product: 3000, research: 500, charity: 400, government: 4500 },
  extras_prices: { bilingual: 300, mention: 200, story: 150, encyclopedia: 500, pin6: 100, pin12: 200, repost: 150, campaign: 1000, video: 400, report: 800, plan: 1500, website: 5000, media: 10000, infographic: 300 },
  scope_multipliers: { single: 1.0, all: 1.5 },
  image_multipliers: { one: 1.0, multi: 1.2 },
  discount_table: { '1': 0, '2': 5, '3': 10, '4': 15, '5': 20, '6': 25, '7': 30, '8': 35, '9': 40, '10': 45 },
  max_discount: 50,
  vat_rate: 0.15,
}

export default function AdminInfluencersPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [influencers, setInfluencers] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  // Add/Edit influencer
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  // Pricing editor
  const [pricingInfluencer, setPricingInfluencer] = useState<any>(null)
  const [pricing, setPricing] = useState<PricingData>({ ...defaultPricing })

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }

    const { data } = await supabase.from('influencers').select('*').order('created_at', { ascending: false })
    setInfluencers(data ?? [])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadData() }, [loadData])

  // ─── Influencer CRUD ───

  const openAddForm = () => { setEditId(null); setForm({ ...emptyForm }); setShowForm(true) }

  const openEditForm = (inf: any) => {
    setEditId(inf.id)
    setForm({
      name_ar: inf.name_ar ?? '', name_en: inf.name_en ?? '',
      x_handle: inf.x_handle ?? '', x_followers: inf.x_followers ?? 0,
      ig_handle: inf.ig_handle ?? '', ig_followers: inf.ig_followers ?? 0,
      li_handle: inf.li_handle ?? '', li_followers: inf.li_followers ?? 0,
      tk_handle: inf.tk_handle ?? '', tk_followers: inf.tk_followers ?? 0,
      bio: inf.bio ?? '', price_multiplier: inf.price_multiplier ?? 1.0,
    })
    setShowForm(true)
  }

  const handleSaveInfluencer = async () => {
    setSaving(true)
    if (editId) {
      const { error } = await supabase.from('influencers').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editId)
      if (error) showToast('فشل تحديث المؤثر', 'error')
      else showToast('تم تحديث المؤثر')
    } else {
      const { data: newInf, error } = await supabase.from('influencers').insert(form).select('id').single()
      if (error) { showToast('فشل إضافة المؤثر', 'error') }
      else {
        // Create default pricing for new influencer
        await supabase.from('pricing_config').insert({
          id: 'inf_' + newInf.id,
          influencer_id: newInf.id,
          ...defaultPricing,
        })
        showToast('تم إضافة المؤثر')
      }
    }
    setShowForm(false); setEditId(null); setForm({ ...emptyForm })
    loadData()
    setSaving(false)
  }

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from('influencers').update({ is_active: !active }).eq('id', id)
    showToast(active ? 'تم تعطيل المؤثر' : 'تم تفعيل المؤثر')
    loadData()
  }

  // ─── Pricing Editor ───

  const openPricing = async (inf: any) => {
    setPricingInfluencer(inf)
    const { data } = await supabase.from('pricing_config').select('*').eq('influencer_id', inf.id).single()
    if (data) {
      setPricing({
        base_prices: data.base_prices ?? defaultPricing.base_prices,
        extras_prices: data.extras_prices ?? defaultPricing.extras_prices,
        scope_multipliers: data.scope_multipliers ?? defaultPricing.scope_multipliers,
        image_multipliers: data.image_multipliers ?? defaultPricing.image_multipliers,
        discount_table: data.discount_table ?? defaultPricing.discount_table,
        max_discount: data.max_discount ?? defaultPricing.max_discount,
        vat_rate: data.vat_rate ?? defaultPricing.vat_rate,
      })
    } else {
      setPricing({ ...defaultPricing })
    }
  }

  const handleSavePricing = async () => {
    if (!pricingInfluencer) return
    setSaving(true)
    const { error } = await supabase.from('pricing_config').upsert({
      id: 'inf_' + pricingInfluencer.id,
      influencer_id: pricingInfluencer.id,
      ...pricing,
      updated_at: new Date().toISOString(),
    })
    if (error) showToast('فشل حفظ الأسعار', 'error')
    else showToast(`تم حفظ أسعار ${pricingInfluencer.name_ar}`)
    setSaving(false)
  }

  if (loading) return <LoadingSpinner size="lg" />

  // ─── If pricing editor is open, show it ───
  if (pricingInfluencer) {
    return (
      <div className="p-4 md:p-6">
        <button onClick={() => setPricingInfluencer(null)} className="text-sm text-green hover:underline mb-4 block cursor-pointer">
          → العودة لقائمة المؤثرين
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-green/10 rounded-full flex items-center justify-center text-green text-xl font-black">
            {pricingInfluencer.name_ar?.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-black text-dark">أسعار {pricingInfluencer.name_ar}</h1>
            {pricingInfluencer.name_en && <p className="text-sm text-muted" dir="ltr">{pricingInfluencer.name_en}</p>}
          </div>
        </div>

        <div className="space-y-6">
          {/* Base Prices */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-bold text-dark text-lg mb-4">الأسعار الأساسية (ر.س)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CATEGORIES.map(cat => (
                <div key={cat.id} className="flex items-center gap-2">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-sm text-dark flex-1 truncate">{cat.nameAr}</span>
                  <input type="number" dir="ltr"
                    className="w-24 px-3 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                    value={pricing.base_prices[cat.id] ?? 0}
                    onChange={e => setPricing({ ...pricing, base_prices: { ...pricing.base_prices, [cat.id]: parseInt(e.target.value) || 0 } })}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Extras */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-bold text-dark text-lg mb-4">أسعار المزايا الإضافية (ر.س)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EXTRAS.map(ext => (
                <div key={ext.id} className="flex items-center gap-2">
                  <span className="text-lg">{ext.icon}</span>
                  <span className="text-sm text-dark flex-1 truncate">{ext.nameAr}</span>
                  <input type="number" dir="ltr"
                    className="w-24 px-3 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                    value={pricing.extras_prices[ext.id] ?? 0}
                    onChange={e => setPricing({ ...pricing, extras_prices: { ...pricing.extras_prices, [ext.id]: parseInt(e.target.value) || 0 } })}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Multipliers */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-bold text-dark text-lg mb-4">المضاعفات</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-dark mb-3">نطاق النشر</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted flex-1">X فقط</span>
                    <input type="number" dir="ltr" step="0.1" className="w-20 px-3 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                      value={pricing.scope_multipliers.single}
                      onChange={e => setPricing({ ...pricing, scope_multipliers: { ...pricing.scope_multipliers, single: parseFloat(e.target.value) || 1 } })} />
                    <span className="text-xs text-muted">×</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted flex-1">جميع القنوات</span>
                    <input type="number" dir="ltr" step="0.1" className="w-20 px-3 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                      value={pricing.scope_multipliers.all}
                      onChange={e => setPricing({ ...pricing, scope_multipliers: { ...pricing.scope_multipliers, all: parseFloat(e.target.value) || 1 } })} />
                    <span className="text-xs text-muted">×</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-dark mb-3">عدد الصور</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted flex-1">صورة واحدة</span>
                    <input type="number" dir="ltr" step="0.1" className="w-20 px-3 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                      value={pricing.image_multipliers.one}
                      onChange={e => setPricing({ ...pricing, image_multipliers: { ...pricing.image_multipliers, one: parseFloat(e.target.value) || 1 } })} />
                    <span className="text-xs text-muted">×</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted flex-1">2-4 صور</span>
                    <input type="number" dir="ltr" step="0.1" className="w-20 px-3 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                      value={pricing.image_multipliers.multi}
                      onChange={e => setPricing({ ...pricing, image_multipliers: { ...pricing.image_multipliers, multi: parseFloat(e.target.value) || 1 } })} />
                    <span className="text-xs text-muted">×</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Discount Table */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-bold text-dark text-lg mb-4">جدول خصومات تعدد المنشورات (%)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <div key={n} className="flex items-center gap-2">
                  <span className="text-sm font-bold text-dark w-8">{n} منشور</span>
                  <input type="number" dir="ltr" min="0" max="100"
                    className="w-16 px-2 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                    value={pricing.discount_table[String(n)] ?? 0}
                    onChange={e => setPricing({ ...pricing, discount_table: { ...pricing.discount_table, [String(n)]: parseInt(e.target.value) || 0 } })} />
                  <span className="text-xs text-muted">%</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
              <span className="text-sm font-bold text-dark">11+ منشور</span>
              <input type="number" dir="ltr" min="0" max="100"
                className="w-20 px-3 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                value={pricing.max_discount}
                onChange={e => setPricing({ ...pricing, max_discount: parseInt(e.target.value) || 0 })} />
              <span className="text-xs text-muted">% (الحد الأقصى)</span>
            </div>
          </div>

          {/* VAT */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-bold text-dark text-lg mb-4">ضريبة القيمة المضافة</h2>
            <div className="flex items-center gap-3">
              <input type="number" dir="ltr" step="0.01" min="0" max="1"
                className="w-24 px-3 py-2 rounded-lg border border-border bg-cream text-sm text-center"
                value={pricing.vat_rate}
                onChange={e => setPricing({ ...pricing, vat_rate: parseFloat(e.target.value) || 0 })} />
              <span className="text-sm text-muted">({(pricing.vat_rate * 100).toFixed(0)}%)</span>
            </div>
          </div>

          <Button onClick={handleSavePricing} loading={saving} size="lg" className="w-full">
            حفظ أسعار {pricingInfluencer.name_ar}
          </Button>
        </div>
      </div>
    )
  }

  // ─── Influencers List ───
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-dark">إدارة المؤثرين</h1>
        <Button onClick={openAddForm}>+ إضافة مؤثر</Button>
      </div>

      <div className="grid gap-4">
        {influencers.map(inf => {
          const total = (inf.x_followers ?? 0) + (inf.ig_followers ?? 0) + (inf.li_followers ?? 0) + (inf.tk_followers ?? 0)
          return (
            <div key={inf.id} className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-green/10 rounded-full flex items-center justify-center text-green font-black">
                      {inf.name_ar?.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-dark">{inf.name_ar}</h3>
                      {inf.name_en && <p className="text-xs text-muted" dir="ltr">{inf.name_en}</p>}
                    </div>
                  </div>
                  {inf.bio && <p className="text-sm text-muted mb-3">{inf.bio}</p>}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {inf.x_followers > 0 && <span className="px-2 py-1 bg-dark/5 rounded-lg">𝕏 {formatNumberShort(inf.x_followers)}</span>}
                    {inf.ig_followers > 0 && <span className="px-2 py-1 bg-pink-50 rounded-lg text-pink-600">◉ {formatNumberShort(inf.ig_followers)}</span>}
                    {inf.li_followers > 0 && <span className="px-2 py-1 bg-blue-50 rounded-lg text-blue-600">in {formatNumberShort(inf.li_followers)}</span>}
                    {inf.tk_followers > 0 && <span className="px-2 py-1 bg-teal-50 rounded-lg text-teal-600">▶ {formatNumberShort(inf.tk_followers)}</span>}
                    <span className="px-2 py-1 bg-green/10 rounded-lg text-green font-bold">الإجمالي: {formatNumberShort(total)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button onClick={() => openEditForm(inf)} className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all">
                    تعديل
                  </button>
                  <button onClick={() => openPricing(inf)} className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer bg-gold/10 text-gold hover:bg-gold/20 transition-all">
                    الأسعار
                  </button>
                  <button onClick={() => handleToggle(inf.id, inf.is_active)} className={`px-4 py-2 rounded-xl text-sm font-medium cursor-pointer ${inf.is_active ? 'bg-green/10 text-green' : 'bg-red-50 text-red-500'}`}>
                    {inf.is_active ? 'مفعّل ✓' : 'معطّل ✕'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {influencers.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4 opacity-30">👥</div>
            <p className="text-muted">لا يوجد مؤثرون — أضف أول مؤثر</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditId(null) }} title={editId ? 'تعديل المؤثر' : 'إضافة مؤثر جديد'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="الاسم بالعربي *" value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} />
            <Input label="الاسم بالإنجليزي" dir="ltr" value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="هاندل X" dir="ltr" placeholder="@handle" value={form.x_handle} onChange={e => setForm({ ...form, x_handle: e.target.value })} />
            <Input label="متابعين X" type="number" dir="ltr" value={String(form.x_followers)} onChange={e => setForm({ ...form, x_followers: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="هاندل Instagram" dir="ltr" value={form.ig_handle} onChange={e => setForm({ ...form, ig_handle: e.target.value })} />
            <Input label="متابعين Instagram" type="number" dir="ltr" value={String(form.ig_followers)} onChange={e => setForm({ ...form, ig_followers: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="هاندل LinkedIn" dir="ltr" value={form.li_handle} onChange={e => setForm({ ...form, li_handle: e.target.value })} />
            <Input label="متابعين LinkedIn" type="number" dir="ltr" value={String(form.li_followers)} onChange={e => setForm({ ...form, li_followers: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="هاندل TikTok" dir="ltr" value={form.tk_handle} onChange={e => setForm({ ...form, tk_handle: e.target.value })} />
            <Input label="متابعين TikTok" type="number" dir="ltr" value={String(form.tk_followers)} onChange={e => setForm({ ...form, tk_followers: parseInt(e.target.value) || 0 })} />
          </div>
          <Input label="نبذة" value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} />
          <Button onClick={handleSaveInfluencer} loading={saving} disabled={!form.name_ar} className="w-full">
            {editId ? 'حفظ التعديلات' : 'إضافة المؤثر'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
