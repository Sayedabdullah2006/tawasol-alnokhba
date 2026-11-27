'use client'

import { useRef, useState, type FormEvent } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { beginPortalVisit } from '@/lib/portal-wallpaper'

export default function CompleteProfileForm({ name, phone, email, next }: {
  name: string; phone: string; email: string; next: string | null
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const form = new FormData(event.currentTarget)
    submitting.current = true
    setError('')
    setPending(true)

    try {
      const response = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), phone: form.get('phone'), next }),
      })
      const result = await response.json()
      if (response.status === 401) {
        const login = next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login'
        window.location.replace(login)
        return
      }
      if (!response.ok) {
        setError(result.error || 'تعذّر حفظ الملف. حاول مرة أخرى.')
        return
      }
      beginPortalVisit()
      window.location.replace(result.destination)
    } catch {
      setError('تعذّر حفظ الملف. حاول مرة أخرى.')
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" aria-describedby={error ? 'profile-save-error' : undefined}>
      {email && <p className="break-all text-sm text-muted" dir="ltr">{email}</p>}
      <Input id="profile-name" name="name" label="الاسم الكامل" defaultValue={name} autoComplete="name" minLength={2} maxLength={160} required />
      <Input id="profile-phone" name="phone" label="رقم الجوال" type="tel" dir="ltr" defaultValue={phone}
        autoComplete="tel" maxLength={32} placeholder="05XXXXXXXX" aria-describedby="profile-phone-help" required />
      <p id="profile-phone-help" className="text-sm text-muted">أدخل الرقم السعودي أو الرقم الدولي مع مفتاح الدولة.</p>
      {error && <p id="profile-save-error" role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" loading={pending}>حفظ ومتابعة</Button>
    </form>
  )
}
