/** Review headings, alternate hooks and link replies must never become one public post. */
export function isStudioReviewBundle(content: string): boolean {
  return /(?:^|\n)\s*(?:#{1,3}\s*|\*\*)?التغريدة الرئيسية\s*[:：]/u.test(content)
    && /(?:الرد الأول|بدائل للخطاف|الحسابات المقترح ذكرها)\s*(?:\([^\n]*\))?\s*[:：]/u.test(content)
}

export const STUDIO_REVIEW_BUNDLE_ERROR = 'هذه حزمة مراجعة تضم رد الرابط وبدائل الخطاف. اختر نص المنشور الرئيسي فقط، وراجع إرسال الرد الأول منفصلًا؛ التكامل الحالي لا يربطه تلقائيًا.'
