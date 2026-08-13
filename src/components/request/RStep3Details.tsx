'use client'

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
  onChange: (data: ContentDetails) => void
}

export default function RStep3Details({ data, onChange }: Props) {
  const update = <K extends keyof ContentDetails>(field: K, value: ContentDetails[K]) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div className="wizard-enter max-w-lg mx-auto">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        احكي لنا عن خبرك
      </h2>
      <p className="text-sm text-muted text-center mb-6">اكتب بحرية وكأنك تشرح لصديق — نقدر نهذّب الصياغة لاحقاً</p>

      <div className="space-y-4">
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

        <div className="rounded-lg border border-green/25 bg-green/5 p-4">
          <label className="mb-1 block text-sm font-black text-dark">ارفع هنا الصور الشخصية للتصميم</label>
          <p className="mb-3 text-xs leading-5 text-muted">هذه الصور فقط ستُستخدم كصور مرجعية عند توليد التصاميم.</p>
          <ContentImagesUploader
            images={data.images}
            onChange={imgs => update('images', imgs)}
          />
        </div>

        <div className="rounded-lg border border-border bg-cream/40 p-4">
          <label className="mb-1 block text-sm font-black text-dark">ارفع هنا الوثائق الداعمة إن وجدت</label>
          <p className="mb-3 text-xs leading-5 text-muted">مثل الشهادات أو خطابات الإثبات أو ملفات الخبر. لن تُستخدم هذه الملفات داخل التصميم.</p>
          <SupportingDocumentsUploader documents={data.supportingDocuments ?? []} onChange={documents => update('supportingDocuments', documents)} />
        </div>

      </div>
    </div>
  )
}
