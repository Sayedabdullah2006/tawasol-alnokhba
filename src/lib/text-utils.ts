// أدوات إصلاح النصوص العربية والمختلطة

/**
 * إصلاح عرض النصوص العربية المعكوسة أو المشوهة
 */
export function fixArabicText(text: string): string {
  if (!text) return text

  // إزالة المسافات الزائدة
  text = text.trim()

  // فحص إذا كان النص معكوساً (يحتوي على أحرف عربية لكن بترتيب خاطئ)
  const arabicRegex = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
  const hasArabic = arabicRegex.test(text)

  if (hasArabic) {
    // إصلاح النص المعكوس
    const words = text.split(' ')
    const fixedWords = words.map(word => {
      // إذا كانت الكلمة تحتوي على أحرف عربية وتبدو معكوسة
      if (arabicRegex.test(word) && isTextReversed(word)) {
        return reverseArabicWord(word)
      }
      return word
    })

    return fixedWords.join(' ')
  }

  return text
}

/**
 * فحص إذا كان النص العربي معكوساً
 */
function isTextReversed(text: string): boolean {
  // فحص أنماط شائعة للنصوص المعكوسة
  const reversedPatterns = [
    /ريدم/, // "مدير" معكوس
    /ةصنم/, // "منصة" معكوس
    /نيرثؤملا/, // "المؤثرين" معكوس
    /لا$/, // ينتهي بـ "ال" (قد يكون "ال" في البداية معكوسة)
  ]

  return reversedPatterns.some(pattern => pattern.test(text))
}

/**
 * إصلاح كلمة عربية معكوسة
 */
function reverseArabicWord(word: string): string {
  // قاموس للكلمات المعكوسة الشائعة
  const reversedDictionary: Record<string, string> = {
    'ريدم': 'مدير',
    'ةصنم': 'منصة',
    'نيرثؤملا': 'المؤثرين',
    'مسلا': 'الاسم',
    'ليمعلا': 'العميل',
    'لجرلا': 'الرجل',
    'ةأرملا': 'المرأة',
  }

  // فحص إذا كانت الكلمة في القاموس
  if (reversedDictionary[word]) {
    return reversedDictionary[word]
  }

  // إذا لم تكن في القاموس، اعكس الأحرف
  return word.split('').reverse().join('')
}

/**
 * تطبيع النص العربي
 */
export function normalizeArabicText(text: string): string {
  if (!text) return text

  return text
    // توحيد الهمزات
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ؤئ]/g, 'ء')
    // توحيد الياء والتاء
    .replace(/ي/g, 'ي')
    .replace(/ة/g, 'ة')
    // إزالة التشكيل
    .replace(/[ً-ْ]/g, '')
    // إزالة المسافات الزائدة
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * فحص وإصلاح اتجاه النص للأسماء المختلطة
 */
export function fixTextDirection(text: string): string {
  if (!text) return text

  // تنظيف النص الأساسي وإزالة أي direction markers موجودة
  text = text.trim()
    .replace(/[‪-‮⁦-⁩]/g, '') // إزالة Unicode direction markers

  // فحص نوع النص
  const hasArabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text)
  const hasEnglish = /[a-zA-Z]/.test(text)

  // إذا كان النص مختلط (عربي + إنجليزي)
  if (hasArabic && hasEnglish) {
    return handleMixedText(text)
  }

  // إذا كان النص عربي فقط
  if (hasArabic) {
    const fixed = fixArabicText(text)
    return normalizeArabicText(fixed)
  }

  // إذا كان النص إنجليزي فقط
  return text
}

/**
 * إضافة direction markers للتحكم في عرض النص
 */
export function addDirectionMarkers(text: string): string {
  if (!text) return text

  const hasArabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text)
  const hasEnglish = /[a-zA-Z]/.test(text)

  if (hasArabic && !hasEnglish) {
    // عربي فقط - RLE (Right-to-Left Embedding)
    return '‫' + text + '‬'
  } else if (!hasArabic && hasEnglish) {
    // إنجليزي فقط - LRE (Left-to-Right Embedding)
    return '‪' + text + '‬'
  } else if (hasArabic && hasEnglish) {
    // مختلط - LRO (Left-to-Right Override) للتحكم الكامل
    return '‭' + text + '‬'
  }

  return text
}

/**
 * معالجة النصوص المختلطة (عربي + إنجليزي)
 */
function handleMixedText(text: string): string {
  // أنماط شائعة للأسماء المختلطة
  const mixedPatterns = [
    // اسم إنجليزي + لقب عربي: "John الدوسري"
    /^([a-zA-Z\s\-\.]+)\s+([؀-ۿ\s]+)$/,
    // اسم عربي + لقب إنجليزي: "أحمد Smith"
    /^([؀-ۿ\s]+)\s+([a-zA-Z\s\-\.]+)$/,
    // اسم مركب: "محمد Al-Ahmed"
    /^([؀-ۿ\s]+)\s+(Al-[a-zA-Z]+)$/i,
    /^([a-zA-Z\s]+)\s+(آل\s+[؀-ۿ\s]+)$/,
  ]

  for (const pattern of mixedPatterns) {
    const match = text.match(pattern)
    if (match) {
      const [_, part1, part2] = match

      // تحديد أي جزء عربي وأي جزء إنجليزي
      const part1IsArabic = /[؀-ۿ]/.test(part1)
      const part2IsArabic = /[؀-ۿ]/.test(part2)

      if (part1IsArabic && !part2IsArabic) {
        // عربي + إنجليزي
        return `${normalizeArabicText(part1)} ${part2.trim()}`
      } else if (!part1IsArabic && part2IsArabic) {
        // إنجليزي + عربي
        return `${part1.trim()} ${normalizeArabicText(part2)}`
      }
    }
  }

  // إذا لم تطابق الأنماط، طبق التنظيف العام
  const words = text.split(/\s+/)
  const cleanWords = words.map(word => {
    if (/[؀-ۿ]/.test(word)) {
      return normalizeArabicText(fixArabicText(word))
    }
    return word
  })

  return cleanWords.join(' ')
}