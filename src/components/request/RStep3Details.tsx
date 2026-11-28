'use client'

import type { Dispatch, ReactNode, SetStateAction } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import ContentImagesUploader from './ContentImagesUploader'
import SupportingDocumentsUploader from './SupportingDocumentsUploader'
import type { SupportingDocument } from '@/lib/request-attachments'

export interface ContentDetails {
  title: string
  content: string
  link: string
  hashtags: string
  preferredDate: string
  images: string[]
  supportingDocuments: SupportingDocument[]
}

interface Props {
  data: ContentDetails
  onChange: Dispatch<SetStateAction<ContentDetails>>
  contact?: ReactNode
}

export default function RStep3Details({ data, onChange, contact }: Props) {
  const update = <K extends keyof ContentDetails>(field: K, value: ContentDetails[K]) => {
    onChange(current => ({ ...current, [field]: value }))
  }

  return (
    <div className="space-y-4">
      <div className={contact ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]' : undefined}>
        <div className="min-w-0 space-y-4">
          <h3 className="text-lg font-bold text-dark">محتوى الخبر</h3>
          <Input
            id="title"
            label="عنوان الخبر *"
            placeholder="أدخل عنوان الخبر الرئيسي"
            value={data.title}
            onChange={e => update('title', e.target.value)}
            required
          />
          <Textarea
            id="content"
            label="تفاصيل الخبر *"
            placeholder="اكتب تفاصيل الخبر أو المحتوى كاملاً..."
            value={data.content}
            onChange={e => update('content', e.target.value)}
            showCount
            maxLength={5000}
            required
          />
        </div>
        {contact && <section className="min-w-0 rounded-xl border border-border p-4">{contact}</section>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">

        <div className="rounded-lg border border-green/25 bg-green/5 p-4">
          <h3 className="mb-1 text-sm font-black text-dark">صور الخبر للتصميم</h3>
          <p className="mb-3 text-xs leading-5 text-muted">هذه الصور فقط ستُستخدم كصور مرجعية عند توليد التصاميم.</p>
          <ContentImagesUploader
            images={data.images}
            onChange={imgs => update('images', imgs)}
          />
        </div>

        <div className="rounded-lg border border-border bg-cream/40 p-4">
          <h3 className="mb-1 text-sm font-black text-dark">مرفقات داعمة</h3>
          <p className="mb-3 text-xs leading-5 text-muted">مثل الشهادات أو خطابات الإثبات أو ملفات الخبر. لن تُستخدم هذه الملفات داخل التصميم.</p>
          <SupportingDocumentsUploader documents={data.supportingDocuments ?? []} onChange={documents => update('supportingDocuments', documents)} />
        </div>

      </div>
    </div>
  )
}
