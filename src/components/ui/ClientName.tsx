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

  // إضافة Unicode direction markers للتحكم في العرض
  let finalDisplayName = displayName
  let textDirection: 'ltr' | 'rtl' = 'ltr'
  let textAlign: 'left' | 'right' = 'left'

  if (hasArabic && !hasEnglish) {
    // عربي فقط - أضف RLE (Right-to-Left Embedding)
    finalDisplayName = '‫' + displayName + '‬'
    textDirection = 'rtl'
    textAlign = 'right'
  } else if (!hasArabic && hasEnglish) {
    // إنجليزي فقط - أضف LRE (Left-to-Right Embedding)
    finalDisplayName = '‪' + displayName + '‬'
    textDirection = 'ltr'
    textAlign = 'left'
  } else if (hasArabic && hasEnglish) {
    // مختلط - استخدم LRO (Left-to-Right Override) للتحكم الكامل
    finalDisplayName = '‭' + displayName + '‬'
    textDirection = 'ltr'
    textAlign = 'left'
  }

  return (
    <span
      className={`client-name-fixed inline-block ${className}`}
      dir={textDirection}
      style={{
        textAlign,
        unicodeBidi: 'bidi-override',
        direction: textDirection,
        maxWidth: maxLength ? `${maxLength * 0.6}em` : undefined,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'inline-block'
      }}
      title={fixedName} // عرض الاسم الكامل عند hover
    >
      {finalDisplayName}
    </span>
  )
}