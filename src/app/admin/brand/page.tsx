'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

export default function AdminBrandPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    // Verify admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }

    const res = await fetch('/api/admin/brand-settings')
    if (res.ok) {
      const data = await res.json()
      setLogoUrl(data.logoUrl ?? null)
    }
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return

    if (file.size > MAX_SIZE) {
      showToast('حجم الملف أكبر من 10MB', 'error')
      return
    }
    if (!ALLOWED.includes(file.type)) {
      showToast('صيغة غير مدعومة (PNG, JPG, WEBP فقط)', 'error')
      return
    }

    setUploading(true)
    try {
      // 1) Upload the file to the public content-images bucket (client-side).
      const ext = file.name.split('.').pop()
      const path = `brand-logo-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('content-images').upload(path, file)
      if (upErr) {
        showToast(`فشل رفع الشعار: ${upErr.message}`, 'error')
        setUploading(false)
        return
      }
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      const publicUrl = data.publicUrl

      // 2) Persist the public URL via the settings API.
      const res = await fetch('/api/admin/brand-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: publicUrl }),
      })
      if (res.ok) {
        setLogoUrl(publicUrl)
        showToast('تم تحديث شعار التصاميم', 'success')
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? 'فشل حفظ الشعار', 'error')
      }
    } catch {
      showToast('حدث خطأ أثناء الرفع', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-dark">شعار أول سعودي للتصاميم</h1>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 md:p-6 max-w-xl space-y-5">
        <p className="text-sm text-muted">
          هذا الشعار يُوضع تلقائياً أسفل يمين التصاميم المولّدة بالذكاء الاصطناعي
          (فوق منحنى الفوتر).
        </p>

        <div>
          <label className="block text-sm font-medium text-dark mb-2">الشعار الحالي</label>
          {logoUrl ? (
            <div className="inline-block rounded-2xl border border-border bg-cream p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="شعار أول سعودي" className="max-h-40 max-w-xs object-contain" />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-cream p-6 text-center text-sm text-muted">
              لا يوجد شعار محفوظ بعد
            </div>
          )}
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={e => handleFile(e.target.files?.[0])}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            disabled={uploading}
          >
            {logoUrl ? '🔄 تغيير الشعار' : '⬆️ رفع شعار'}
          </Button>
          <p className="text-xs text-muted mt-2">
            PNG, JPG, WEBP — حتى 10MB. يُفضّل خلفية شفافة (PNG).
          </p>
        </div>
      </div>
    </div>
  )
}
