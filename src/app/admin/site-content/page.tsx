'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface CategoryRow { id: string; name_ar: string; icon: string }

export default function AdminSiteContentPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [termsText, setTermsText] = useState('')
  // البنود العامة لشروط قبول الخبر — سطر لكل بند
  const [generalText, setGeneralText] = useState('')
  const [footerLine, setFooterLine] = useState('')
  const [categoryConditions, setCategoryConditions] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<CategoryRow[]>([])

  const load = useCallback(async () => {
    // Verify admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }

    const [res, cats] = await Promise.all([
      fetch('/api/admin/site-content'),
      supabase.from('categories').select('id, name_ar, icon').order('sort_order'),
    ])
    if (res.ok) {
      const { content } = await res.json()
      setTermsText(content?.terms_text ?? '')
      setGeneralText(
        Array.isArray(content?.news_conditions_general)
          ? content.news_conditions_general.join('\n')
          : ''
      )
      setFooterLine(content?.news_conditions_footer ?? '')
      setCategoryConditions(
        content?.category_conditions && typeof content.category_conditions === 'object'
          ? content.category_conditions
          : {}
      )
    } else {
      showToast('فشل تحميل المحتوى', 'error')
    }
    setCategories((cats.data as CategoryRow[]) ?? [])
    setLoading(false)
  }, [supabase, router, showToast])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/site-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termsText,
          newsConditionsGeneral: generalText.split('\n').map(s => s.trim()).filter(Boolean),
          newsConditionsFooter: footerLine,
          categoryConditions,
        }),
      })
      if (res.ok) {
        showToast('تم الحفظ — سينعكس مباشرة على نموذج الطلب', 'success')
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? 'فشل الحفظ', 'error')
      }
    } catch {
      showToast('حدث خطأ أثناء الحفظ', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // فئات قد يكون لها شرط محفوظ دون أن تكون ضمن جدول الفئات (مثل Others)
  const extraKeys = Object.keys(categoryConditions).filter(
    k => !categories.some(c => c.id === k)
  )

  const card = 'bg-card rounded-2xl border border-border p-5 space-y-3'
  const textareaCls = 'w-full px-3 py-2 rounded-xl border border-border bg-white text-sm leading-relaxed resize-y'

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-dark">📄 محتوى نموذج الطلب</h1>
        <p className="text-sm text-muted mt-1">
          عدّل الشروط والأحكام وشروط قبول الخبر — التعديلات تنعكس تلقائياً على نموذج الطلب.
        </p>
      </div>

      {/* الشروط والأحكام وسياسة الخصوصية */}
      <div className={card}>
        <h2 className="font-bold text-dark">الشروط والأحكام وسياسة الخصوصية</h2>
        <p className="text-xs text-muted">
          تظهر في نافذة «الشروط والأحكام وسياسة الخصوصية» أسفل نموذج الطلب.
        </p>
        <textarea
          value={termsText}
          onChange={e => setTermsText(e.target.value)}
          className={`${textareaCls} min-h-[320px]`}
        />
      </div>

      {/* شروط قبول الخبر — العامة */}
      <div className={card}>
        <h2 className="font-bold text-dark">⚠️ شروط قبول الخبر — البنود العامة</h2>
        <p className="text-xs text-muted">
          تظهر بخط أحمر أعلى قسم «تفاصيل المحتوى». اكتب كل بند في سطر مستقل.
        </p>
        <textarea
          value={generalText}
          onChange={e => setGeneralText(e.target.value)}
          className={`${textareaCls} min-h-[110px]`}
          placeholder="بند في كل سطر..."
        />
        <div>
          <label className="block text-xs font-bold text-dark mb-1">السطر الختامي (التحذير)</label>
          <input
            value={footerLine}
            onChange={e => setFooterLine(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm"
          />
        </div>
      </div>

      {/* شروط قبول الخبر — بحسب الفئة */}
      <div className={card}>
        <h2 className="font-bold text-dark">⚠️ شروط قبول الخبر — بحسب نوع الخبر</h2>
        <p className="text-xs text-muted">
          يظهر شرط الفئة المختارة فقط للعميل (في المنشور المفرد وفي كل منشور حملة).
          اترك الحقل فارغاً لإخفاء شرط الفئة.
        </p>
        <div className="space-y-3">
          {categories.map(cat => (
            <div key={cat.id}>
              <label className="block text-xs font-bold text-dark mb-1">
                {cat.icon} {cat.name_ar} <span className="text-muted font-normal">({cat.id})</span>
              </label>
              <textarea
                value={categoryConditions[cat.id] ?? ''}
                onChange={e =>
                  setCategoryConditions(prev => ({ ...prev, [cat.id]: e.target.value }))
                }
                className={`${textareaCls} min-h-[52px]`}
              />
            </div>
          ))}
          {extraKeys.map(key => (
            <div key={key}>
              <label className="block text-xs font-bold text-dark mb-1">
                {key} <span className="text-muted font-normal">(فئة غير معروضة حالياً)</span>
              </label>
              <textarea
                value={categoryConditions[key] ?? ''}
                onChange={e =>
                  setCategoryConditions(prev => ({ ...prev, [key]: e.target.value }))
                }
                className={`${textareaCls} min-h-[52px]`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-20 md:bottom-4">
        <Button onClick={save} loading={saving} disabled={saving} className="w-full">
          💾 حفظ التعديلات
        </Button>
      </div>
    </div>
  )
}
