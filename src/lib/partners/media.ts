/** Backward-compatible purpose labels stored by partners in the existing name field. */
export function partnerMedia(name: string) {
  if (name.startsWith('[news-design] ')) return { purpose: 'news', name: name.slice(14), title: 'صور الخبر للتصميم' }
  if (name.startsWith('[supporting] ')) return { purpose: 'supporting', name: name.slice(13), title: 'مرفقات داعمة — غير مخصصة للنشر' }
  return { purpose: 'legacy', name, title: 'مرفقات الطلب' }
}
