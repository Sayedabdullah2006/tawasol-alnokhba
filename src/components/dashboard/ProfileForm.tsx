'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface Props {
  profile: {
    id: string
    full_name: string | null
    phone: string | null
    city: string | null
    x_handle: string | null
  }
  email?: string
}

export default function ProfileForm({ profile: initial, email: initialEmail }: Props) {
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState(initialEmail ?? '')
  const [form, setForm] = useState({
    full_name: initial.full_name ?? '',
    phone: initial.phone ?? '',
    city: initial.city ?? '',
    x_handle: initial.x_handle ?? '',
  })

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()

    // Update profile
    const { error } = await supabase
      .from('profiles')
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq('id', initial.id)

    if (error) {
      showToast('حدث خطأ أثناء الحفظ', 'error')
      setSaving(false)
      return
    }

    // Update email if changed
    if (email && email !== initialEmail) {
      const { error: emailError } = await supabase.auth.updateUser({ email })
      if (emailError) {
        showToast('حدث خطأ أثناء تحديث البريد الإلكتروني', 'error')
        setSaving(false)
        return
      }
    }

    showToast('تم حفظ الملف الشخصي')
    setSaving(false)
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <Input
        id="full_name"
        label="الاسم الكامل"
        value={form.full_name}
        onChange={e => setForm({ ...form, full_name: e.target.value })}
      />
      <Input
        id="email"
        label="البريد الإلكتروني"
        type="email"
        dir="ltr"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <Input
        id="phone"
        label="رقم الجوال"
        dir="ltr"
        type="tel"
        placeholder="05XXXXXXXX"
        value={form.phone}
        onChange={e => setForm({ ...form, phone: e.target.value })}
      />
      <Input
        id="city"
        label="المدينة"
        value={form.city}
        onChange={e => setForm({ ...form, city: e.target.value })}
      />
      <Input
        id="x_handle"
        label="حساب X"
        dir="ltr"
        placeholder="بدون @"
        value={form.x_handle}
        onChange={e => setForm({ ...form, x_handle: e.target.value })}
      />
      <Button onClick={handleSave} loading={saving}>حفظ التعديلات</Button>
    </div>
  )
}
