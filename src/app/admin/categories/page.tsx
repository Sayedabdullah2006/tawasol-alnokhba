'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

type Tab = 'categories' | 'extras'

export default function AdminCategoriesPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('categories')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Categories
  const [categories, setCategories] = useState<any[]>([])
  const [showCatForm, setShowCatForm] = useState(false)
  const [editCatId, setEditCatId] = useState<string | null>(null)
  const [catForm, setCatForm] = useState({ id: '', name_ar: '', icon: '📋', description: '', sort_order: 0, client_types: '' })

  // Extras
  const [extras, setExtras] = useState<any[]>([])
  const [showExtForm, setShowExtForm] = useState(false)
  const [editExtId, setEditExtId] = useState<string | null>(null)
  const [extForm, setExtForm] = useState({ id: '', name_ar: '', icon: '📋', default_price: 0, category_only: '', sort_order: 0 })

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }

    const [catsRes, extsRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('extras').select('*').order('sort_order'),
    ])
    setCategories(catsRes.data ?? [])
    setExtras(extsRes.data ?? [])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadData() }, [loadData])

  // ─── Categories CRUD ───
  const openAddCat = () => { setEditCatId(null); setCatForm({ id: '', name_ar: '', icon: '📋', description: '', sort_order: categories.length + 1, client_types: '' }); setShowCatForm(true) }
  const openEditCat = (c: any) => {
    setEditCatId(c.id)
    setCatForm({ id: c.id, name_ar: c.name_ar, icon: c.icon, description: c.description ?? '', sort_order: c.sort_order, client_types: c.client_types ? c.client_types.join(',') : '' })
    setShowCatForm(true)
  }

  const handleSaveCat = async () => {
    setSaving(true)
    const payload = {
      id: catForm.id,
      name_ar: catForm.name_ar,
      icon: catForm.icon,
      description: catForm.description || null,
      sort_order: catForm.sort_order,
      client_types: catForm.client_types ? catForm.client_types.split(',').map(s => s.trim()).filter(Boolean) : null,
    }
    if (editCatId) {
      const { error } = await supabase.from('categories').update(payload).eq('id', editCatId)
      if (error) showToast('فشل التحديث: ' + error.message, 'error')
      else showToast('تم تحديث الفئة')
    } else {
      const { error } = await supabase.from('categories').insert(payload)
      if (error) showToast('فشل الإضافة: ' + error.message, 'error')
      else showToast('تم إضافة الفئة')
    }
    setShowCatForm(false); loadData()
    setSaving(false)
  }

  const toggleCat = async (id: string, active: boolean) => {
    await supabase.from('categories').update({ is_active: !active }).eq('id', id)
    showToast(active ? 'تم إخفاء الفئة' : 'تم تفعيل الفئة')
    loadData()
  }

  // ─── Extras CRUD ───
  const openAddExt = () => { setEditExtId(null); setExtForm({ id: '', name_ar: '', icon: '📋', default_price: 0, category_only: '', sort_order: extras.length + 1 }); setShowExtForm(true) }
  const openEditExt = (e: any) => {
    setEditExtId(e.id)
    setExtForm({ id: e.id, name_ar: e.name_ar, icon: e.icon, default_price: e.default_price, category_only: e.category_only ?? '', sort_order: e.sort_order })
    setShowExtForm(true)
  }

  const handleSaveExt = async () => {
    setSaving(true)
    const payload = {
      id: extForm.id,
      name_ar: extForm.name_ar,
      icon: extForm.icon,
      default_price: extForm.default_price,
      category_only: extForm.category_only || null,
      sort_order: extForm.sort_order,
    }
    if (editExtId) {
      const { error } = await supabase.from('extras').update(payload).eq('id', editExtId)
      if (error) showToast('فشل التحديث: ' + error.message, 'error')
      else showToast('تم تحديث الميزة')
    } else {
      const { error } = await supabase.from('extras').insert(payload)
      if (error) showToast('فشل الإضافة: ' + error.message, 'error')
      else showToast('تم إضافة الميزة')
    }
    setShowExtForm(false); loadData()
    setSaving(false)
  }

  const toggleExt = async (id: string, active: boolean) => {
    await supabase.from('extras').update({ is_active: !active }).eq('id', id)
    showToast(active ? 'تم إخفاء الميزة' : 'تم تفعيل الميزة')
    loadData()
  }

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('categories')} className={`px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all ${tab === 'categories' ? 'bg-green text-white' : 'bg-card border border-border text-dark'}`}>
          فئات المحتوى
        </button>
        <button onClick={() => setTab('extras')} className={`px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all ${tab === 'extras' ? 'bg-green text-white' : 'bg-card border border-border text-dark'}`}>
          المزايا الإضافية
        </button>
      </div>

      {/* ═══ Categories ═══ */}
      {tab === 'categories' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-black text-dark">فئات المحتوى</h1>
            <Button onClick={openAddCat}>+ إضافة فئة</Button>
          </div>
          <p className="text-sm text-muted mb-6">أضف أو عدّل أو أخفِ فئات المحتوى — التغييرات تنعكس فوراً في نموذج الطلب</p>

          <div className="space-y-3">
            {categories.map(c => (
              <div key={c.id} className={`bg-card rounded-2xl border p-4 flex items-center gap-3 ${c.is_active ? 'border-border' : 'border-red-200 opacity-60'}`}>
                <span className="text-3xl">{c.icon}</span>
                <div className="flex-1">
                  <h3 className="font-bold text-dark">{c.name_ar}</h3>
                  <p className="text-xs text-muted">{c.description} · ID: {c.id} · ترتيب: {c.sort_order}</p>
                  {c.client_types && <p className="text-xs text-blue-500 mt-1">متاح لـ: {c.client_types.join(', ')}</p>}
                </div>
                <button onClick={() => openEditCat(c)} className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-blue-50 text-blue-600">تعديل</button>
                <button onClick={() => toggleCat(c.id, c.is_active)} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${c.is_active ? 'bg-green/10 text-green' : 'bg-red-50 text-red-500'}`}>
                  {c.is_active ? 'مفعّل' : 'مخفي'}
                </button>
              </div>
            ))}
          </div>

          <Modal open={showCatForm} onClose={() => setShowCatForm(false)} title={editCatId ? 'تعديل الفئة' : 'إضافة فئة جديدة'}>
            <div className="space-y-3">
              <Input label="المعرّف (ID) *" dir="ltr" placeholder="مثال: books" value={catForm.id} onChange={e => setCatForm({ ...catForm, id: e.target.value })} disabled={!!editCatId} />
              <Input label="الاسم بالعربي *" value={catForm.name_ar} onChange={e => setCatForm({ ...catForm, name_ar: e.target.value })} />
              <Input label="الأيقونة" value={catForm.icon} onChange={e => setCatForm({ ...catForm, icon: e.target.value })} />
              <Input label="الوصف" value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} />
              <Input label="الترتيب" type="number" dir="ltr" value={String(catForm.sort_order)} onChange={e => setCatForm({ ...catForm, sort_order: parseInt(e.target.value) || 0 })} />
              <Input label="متاح لأنواع العملاء (مفصولة بفاصلة)" dir="ltr" placeholder="individual,business — اتركه فارغاً للجميع" value={catForm.client_types} onChange={e => setCatForm({ ...catForm, client_types: e.target.value })} />
              <Button onClick={handleSaveCat} loading={saving} disabled={!catForm.id || !catForm.name_ar} className="w-full">
                {editCatId ? 'حفظ التعديلات' : 'إضافة الفئة'}
              </Button>
            </div>
          </Modal>
        </>
      )}

      {/* ═══ Extras ═══ */}
      {tab === 'extras' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-black text-dark">المزايا الإضافية</h1>
            <Button onClick={openAddExt}>+ إضافة ميزة</Button>
          </div>
          <p className="text-sm text-muted mb-6">أضف أو عدّل أو أخفِ المزايا — التغييرات تنعكس فوراً في نموذج الطلب</p>

          <div className="space-y-3">
            {extras.map(e => (
              <div key={e.id} className={`bg-card rounded-2xl border p-4 flex items-center gap-3 ${e.is_active ? 'border-border' : 'border-red-200 opacity-60'}`}>
                <span className="text-2xl">{e.icon}</span>
                <div className="flex-1">
                  <h3 className="font-bold text-dark">{e.name_ar}</h3>
                  <p className="text-xs text-muted">
                    السعر الافتراضي: {e.default_price} ر.س · ID: {e.id}
                    {e.category_only && ` · خاص بفئة: ${e.category_only}`}
                  </p>
                </div>
                <button onClick={() => openEditExt(e)} className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-blue-50 text-blue-600">تعديل</button>
                <button onClick={() => toggleExt(e.id, e.is_active)} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${e.is_active ? 'bg-green/10 text-green' : 'bg-red-50 text-red-500'}`}>
                  {e.is_active ? 'مفعّل' : 'مخفي'}
                </button>
              </div>
            ))}
          </div>

          <Modal open={showExtForm} onClose={() => setShowExtForm(false)} title={editExtId ? 'تعديل الميزة' : 'إضافة ميزة جديدة'}>
            <div className="space-y-3">
              <Input label="المعرّف (ID) *" dir="ltr" placeholder="مثال: bilingual" value={extForm.id} onChange={e => setExtForm({ ...extForm, id: e.target.value })} disabled={!!editExtId} />
              <Input label="الاسم بالعربي *" value={extForm.name_ar} onChange={e => setExtForm({ ...extForm, name_ar: e.target.value })} />
              <Input label="الأيقونة" value={extForm.icon} onChange={e => setExtForm({ ...extForm, icon: e.target.value })} />
              <Input label="السعر الافتراضي (ر.س)" type="number" dir="ltr" value={String(extForm.default_price)} onChange={e => setExtForm({ ...extForm, default_price: parseInt(e.target.value) || 0 })} />
              <Input label="خاص بفئة (اتركه فارغاً للجميع)" dir="ltr" placeholder="مثال: cv" value={extForm.category_only} onChange={e => setExtForm({ ...extForm, category_only: e.target.value })} />
              <Input label="الترتيب" type="number" dir="ltr" value={String(extForm.sort_order)} onChange={e => setExtForm({ ...extForm, sort_order: parseInt(e.target.value) || 0 })} />
              <Button onClick={handleSaveExt} loading={saving} disabled={!extForm.id || !extForm.name_ar} className="w-full">
                {editExtId ? 'حفظ التعديلات' : 'إضافة الميزة'}
              </Button>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}
