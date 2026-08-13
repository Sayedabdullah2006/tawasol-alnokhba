export type SupportingDocument = {
  url: string
  name: string
  mimeType: string
  size: number
}

const MAX_DOCUMENTS = 8

export function normalizeImageUrls(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && /^https?:\/\//i.test(item.trim())).map(item => item.trim()))].slice(0, max)
}

export function normalizeSupportingDocuments(value: unknown): SupportingDocument[] {
  if (!Array.isArray(value)) return []
  const documents: SupportingDocument[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const url = typeof raw.url === 'string' ? raw.url.trim() : ''
    if (!/^https?:\/\//i.test(url) || documents.some(document => document.url === url)) continue
    documents.push({
      url,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 180) : 'وثيقة داعمة',
      mimeType: typeof raw.mimeType === 'string' ? raw.mimeType.slice(0, 100) : '',
      size: Number.isFinite(Number(raw.size)) ? Math.max(0, Math.round(Number(raw.size))) : 0,
    })
    if (documents.length >= MAX_DOCUMENTS) break
  }
  return documents
}
