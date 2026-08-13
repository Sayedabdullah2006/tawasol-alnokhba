'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { SupportingDocument } from '@/lib/request-attachments'

const MAX_SIZE = 15 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
])

export default function SupportingDocumentsUploader({ documents, onChange, maxFiles = 8 }: { documents: SupportingDocument[]; onChange: (documents: SupportingDocument[]) => void; maxFiles?: number }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    const selected = Array.from(files).slice(0, Math.max(0, maxFiles - documents.length))
    const valid = selected.filter(file => {
      if (file.size > MAX_SIZE) { setError(`${file.name}: يتجاوز 15MB`); return false }
      if (!ALLOWED.has(file.type)) { setError(`${file.name}: صيغة غير مدعومة`); return false }
      return true
    })
    if (!valid.length) return

    setUploading(true)
    const supabase = createClient()
    const uploaded: SupportingDocument[] = []
    for (const file of valid) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const path = `supporting-documents/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('content-images').upload(path, file, { contentType: file.type })
      if (uploadError) { setError(`فشل رفع ${file.name}: ${uploadError.message}`); continue }
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      uploaded.push({ url: data.publicUrl, name: file.name, mimeType: file.type, size: file.size })
    }
    if (uploaded.length) onChange([...documents, ...uploaded])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return <div className="rounded-lg border border-border bg-white p-3">
    {documents.length > 0 && <div className="mb-3 space-y-2">{documents.map((document, index) => <div key={document.url} className="flex min-w-0 items-center gap-3 rounded-md bg-cream px-3 py-2">
      <span aria-hidden className="text-lg">{document.mimeType.startsWith('image/') ? '▧' : document.mimeType === 'application/pdf' ? 'PDF' : 'DOC'}</span>
      <a href={document.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs font-bold text-dark hover:text-green">{document.name}</a>
      <button type="button" onClick={() => onChange(documents.filter((_, itemIndex) => itemIndex !== index))} className="grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50" aria-label={`حذف ${document.name}`}>×</button>
    </div>)}</div>}
    {documents.length < maxFiles && <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="flex min-h-20 w-full items-center justify-center gap-3 rounded-md border-2 border-dashed border-border text-sm font-bold text-dark transition hover:border-green/50 hover:bg-green/5 disabled:opacity-50"><span aria-hidden className="text-xl">↥</span>{uploading ? 'جارٍ رفع الوثائق...' : 'اختيار الوثائق الداعمة'}</button>}
    <input ref={inputRef} type="file" multiple accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp" className="hidden" onChange={event => upload(event.target.files)} />
    <p className="mt-2 text-[11px] leading-5 text-muted">PDF أو Word أو صور إثبات، حتى 15MB للملف. تستخدم للمراجعة فقط ولا تدخل في توليد التصميم.</p>
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
}
