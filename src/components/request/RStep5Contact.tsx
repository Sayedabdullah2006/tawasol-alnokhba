'use client'

import { useState, useEffect } from 'react'
import Input from '@/components/ui/Input'
import { validateEmail } from '@/lib/email-validation'

export interface ContactData {
  fullName: string
  phone: string
  email: string
  city: string
  xHandle: string
}

interface Props {
  data: ContactData
  onChange: (data: ContactData) => void
}

export default function RStep5Contact({ data, onChange }: Props) {
  const update = (field: keyof ContactData, value: string) => {
    onChange({ ...data, [field]: value })
  }

  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)

  // Validate email on blur — keep it permissive while typing
  useEffect(() => {
    if (!data.email.trim()) {
      setEmailError(null)
      setEmailSuggestion(null)
      return
    }
    const t = setTimeout(() => {
      const v = validateEmail(data.email)
      if (v.valid) {
        setEmailError(null)
        setEmailSuggestion(null)
      } else {
        setEmailError(v.error ?? null)
        setEmailSuggestion(v.suggestion ?? null)
      }
    }, 500)
    return () => clearTimeout(t)
  }, [data.email])

  return (
    <div className="wizard-enter max-w-lg mx-auto">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        بيانات التواصل
      </h2>
      <p className="text-sm text-muted text-center mb-6">أدخل بياناتك للتواصل</p>

      <div className="space-y-4">
        <Input
          id="fullName"
          label="الاسم الكامل *"
          placeholder="أدخل اسمك الكامل"
          value={data.fullName}
          onChange={e => update('fullName', e.target.value)}
          required
        />
        <Input
          id="phone"
          label="رقم الجوال *"
          dir="ltr"
          type="tel"
          placeholder="05XXXXXXXX"
          value={data.phone}
          onChange={e => update('phone', e.target.value)}
          required
        />
        <div>
          <Input
            id="email"
            label="البريد الإلكتروني *"
            dir="ltr"
            type="email"
            placeholder="email@example.com"
            value={data.email}
            onChange={e => update('email', e.target.value)}
            required
          />
          {emailError && (
            <div className="mt-1 text-xs">
              <p className="text-red-500">{emailError}</p>
              {emailSuggestion && (
                <button
                  type="button"
                  onClick={() => update('email', emailSuggestion)}
                  className="text-green hover:underline cursor-pointer mt-0.5"
                >
                  استخدم {emailSuggestion}
                </button>
              )}
            </div>
          )}
        </div>
        <Input
          id="city"
          label="المدينة"
          placeholder="أدخل مدينتك"
          value={data.city}
          onChange={e => update('city', e.target.value)}
        />
        <Input
          id="xHandle"
          label="حساب X (اختياري)"
          dir="ltr"
          placeholder="username بدون @"
          value={data.xHandle}
          onChange={e => update('xHandle', e.target.value)}
        />
      </div>
    </div>
  )
}
