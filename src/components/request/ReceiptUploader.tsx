'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  onUploaded: (url: string) => void
  receiptUrl: string | null
}

export default function ReceiptUploader({ onUploaded, receiptUrl }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError('')

    if (file.size > 10 * 1024 * 1024) {
      setError('حجم الملف يجب أن يكون أقل من 10MB')
      return
    }

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']
    if (!allowed.includes(file.type)) {
      setError('الملفات المسموحة: PNG, JPG, PDF')
      return
    }

    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(path, file)

    if (uploadError) {
      console.error('Receipt upload error:', uploadError)
      const msg = uploadError.message?.toLowerCase() ?? ''
      if (msg.includes('not found') || msg.includes('bucket')) {
        setError('مخزن الإيصالات غير مهيأ — يرجى إبلاغ الإدارة')
      } else if (msg.includes('row-level security') || msg.includes('policy') || msg.includes('unauthorized')) {
        setError('تعذّر الرفع — تأكد أنك مسجّل الدخول')
      } else {
        setError(`فشل الرفع: ${uploadError.message}`)
      }
      setUploading(false)
      return
    }

    setFileName(file.name)
    onUploaded(path)
    setUploading(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer
                   hover:border-green/50 hover:bg-green/5 transition-all"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />

        {uploading ? (
          <div className="text-green">
            <svg className="animate-spin mx-auto h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">جارٍ رفع الملف...</p>
          </div>
        ) : receiptUrl ? (
          <div>
            <div className="text-4xl mb-2">✓</div>
            <p className="text-sm font-medium text-green mb-1">تم رفع الإيصال بنجاح</p>
            <p className="text-xs text-muted">{fileName}</p>
            <p className="text-xs text-green mt-2 underline">تغيير الملف</p>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-2 opacity-30">📤</div>
            <p className="text-sm font-medium text-dark mb-1">اسحب الإيصال هنا أو انقر للاختيار</p>
            <p className="text-xs text-muted">PNG, JPG, PDF — حتى 10MB</p>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-500 mt-2 text-center">{error}</p>}
    </div>
  )
}
