import { normalizeSupportingDocuments } from '@/lib/request-attachments'

export default function SupportingDocumentsList({ documents }: { documents: unknown }) {
  const items = normalizeSupportingDocuments(documents)
  if (!items.length) return null

  return (
    <div>
      <span className="mb-2 block text-sm text-muted">الوثائق الداعمة ({items.length})</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((document, index) => (
          <a
            key={`${document.url}-${index}`}
            href={document.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-white/70 p-3 transition-colors hover:border-green/40"
          >
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg">▤</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-dark">{document.name || `وثيقة ${index + 1}`}</span>
              <span className="block text-xs text-muted">للمراجعة فقط، ولا تُستخدم في توليد التصميم</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
