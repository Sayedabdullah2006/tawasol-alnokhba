/**
 * مكوّن لعرض أسماء العملاء بالاتجاه الصحيح
 * يتعامل مع النصوص المختلطة (عربي + إنجليزي)
 */

import { fixTextDirection } from '@/lib/text-utils'

interface ClientNameProps {
  name: string
  className?: string
  maxLength?: number
}

export default function ClientName({ name, className = '', maxLength }: ClientNameProps) {
  if (!name) return <span className={`text-muted ${className}`}>لا يوجد اسم</span>

  const fixedName = fixTextDirection(name)
  const displayName = maxLength && fixedName.length > maxLength
    ? fixedName.substring(0, maxLength) + '...'
    : fixedName

  // تحديد اتجاه النص تلقائياً
  const hasArabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(fixedName)
  const hasEnglish = /[a-zA-Z]/.test(fixedName)

  // تحديد الاتجاه والمحاذاة
  let textDirection: 'ltr' | 'rtl' | 'auto' = 'auto'
  let textAlign: 'left' | 'right' | 'center' = 'left'

  if (hasArabic && !hasEnglish) {
    // عربي فقط
    textDirection = 'rtl'
    textAlign = 'right'
  } else if (!hasArabic && hasEnglish) {
    // إنجليزي فقط
    textDirection = 'ltr'
    textAlign = 'left'
  } else if (hasArabic && hasEnglish) {
    // مختلط - دع المتصفح يحدد
    textDirection = 'auto'
    textAlign = 'left'
  }

  return (
    <span
      className={`client-name inline-block ${className}`}
      dir={textDirection}
      style={{
        textAlign,
        unicodeBidi: 'plaintext',
        maxWidth: maxLength ? `${maxLength * 0.6}em` : undefined,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}
      title={fixedName} // عرض الاسم الكامل عند hover
    >
      {displayName}
    </span>
  )
}