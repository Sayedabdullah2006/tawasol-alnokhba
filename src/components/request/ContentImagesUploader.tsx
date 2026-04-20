'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  images: string[]
  onChange: (urls: string[]) => void
  maxImages?: number
}

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

export default function ContentImagesUploader({ images, onChange, maxImages = 8 }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError('')

    const remaining = maxImages - images.length
    const toUpload = Array.from(files).slice(0, remaining)

    for (const file of toUpload) {
      if (file.size > MAX_SIZE) {
        setError(`${file.name}: حجم أكبر من 10MB`)
        continue
      }
      if (!ALLOWED.includes(file.type)) {
        setError(`${file.name}: صيغة غير مدعومة (PNG, JPG, WEBP فقط)`)
        continue
      }
    }

    const valid = toUpload.filter(f => f.size <= MAX_SIZE && ALLOWED.includes(f.type))
    if (valid.length === 0) return

    setUploading(true)
    const supabase = createClient()
    const uploaded: string[] = []

    for (const file of valid) {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('content-images').upload(path, file)
      if (upErr) {
        console.error('Image upload error:', upErr)
        setError(`فشل رفع ${file.name}: ${upErr.message}`)
        continue
      }
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      uploaded.push(data.publicUrl)
    }

    if (uploaded.length > 0) onChange([...images, ...uploaded])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeImage = (idx: number) => {
    const next = images.filter((_, i) => i !== idx)
    onChange(next)
  }

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
        {images.map((url, i) => (
          <div key={url} className="relative group aspect-square rounded-xl overflow-hidden border border-border bg-cream">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(i)}
              className="absolute top-1 left-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="حذف الصورة"
            >
              ✕
            </button>
          </div>
        ))}

        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-green/50 hover:bg-green/5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-50"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-6 w-6 text-green" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-muted">جارٍ الرفع...</span>
              </>
            ) : (
              <>
                <span className="text-2xl opacity-40">📷</span>
                <span className="text-xs text-muted">أضف صورة</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      <p className="text-xs text-muted">
        {images.length} / {maxImages} صور · PNG, JPG, WEBP — حتى 10MB لكل صورة
      </p>
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  )
}
