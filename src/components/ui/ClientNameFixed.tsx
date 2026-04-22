/**
 * إصدار محسّن لعرض أسماء العملاء
 * يحل مشكلة العرض المعكوس نهائياً
 */

import { fixTextDirection, addDirectionMarkers } from '@/lib/text-utils'

interface ClientNameFixedProps {
  name: string
  className?: string
  maxLength?: number
}

export default function ClientNameFixed({ name, className = '', maxLength }: ClientNameFixedProps) {
  if (!name) return <span className={`text-muted ${className}`}>لا يوجد اسم</span>

  // تنظيف وإصلاح النص
  const cleanName = fixTextDirection(name)

  // تحديد نوع النص
  const hasArabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(cleanName)
  const hasEnglish = /[a-zA-Z]/.test(cleanName)

  // اقتطاع النص إذا لزم الأمر
  const displayName = maxLength && cleanName.length > maxLength
    ? cleanName.substring(0, maxLength) + '...'
    : cleanName

  // تحديد الطريقة المناسبة للعرض
  let containerStyle: React.CSSProperties
  let displayText: string

  if (hasArabic && !hasEnglish) {
    // عربي فقط
    containerStyle = {
      direction: 'rtl',
      textAlign: 'right',
      unicodeBidi: 'isolate'
    }
    displayText = displayName
  } else if (!hasArabic && hasEnglish) {
    // إنجليزي فقط
    containerStyle = {
      direction: 'ltr',
      textAlign: 'left',
      unicodeBidi: 'isolate'
    }
    displayText = displayName
  } else {
    // نص مختلط - استخدم approach خاص
    containerStyle = {
      direction: 'ltr',
      textAlign: 'left',
      unicodeBidi: 'isolate'
    }
    // فصل الأجزاء العربية والإنجليزية
    displayText = handleMixedDisplay(displayName)
  }

  return (
    <span
      className={`inline-block ${className}`}
      style={{
        ...containerStyle,
        maxWidth: maxLength ? `${maxLength * 0.6}em` : undefined,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        isolation: 'isolate'
      }}
      title={cleanName}
    >
      {displayText}
    </span>
  )
}

/**
 * معالجة خاصة للنصوص المختلطة
 */
function handleMixedDisplay(text: string): string {
  // فصل الكلمات
  const words = text.split(/\s+/)

  const processedWords = words.map(word => {
    const isArabicWord = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(word)
    const isEnglishWord = /[a-zA-Z]/.test(word)

    if (isArabicWord && !isEnglishWord) {
      // كلمة عربية - لفها في RLE
      return '‫' + word + '‬'
    } else if (!isArabicWord && isEnglishWord) {
      // كلمة إنجليزية - لفها في LRE
      return '‪' + word + '‬'
    }

    return word
  })

  return processedWords.join(' ')
}