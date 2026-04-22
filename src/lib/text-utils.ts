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
 * فحص وإصلاح اتجاه النص
 */
export function fixTextDirection(text: string): string {
  const fixed = fixArabicText(text)
  return normalizeArabicText(fixed)
}