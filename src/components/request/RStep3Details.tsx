'use client'

import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import ContentImagesUploader from './ContentImagesUploader'

interface ContentDetails {
  title: string
  content: string
  link: string
  hashtags: string
  preferredDate: string
  images: string[]
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

        <div>
          <label className="text-sm font-medium text-dark block mb-2">الصور المرفقة (اختياري)</label>
          <ContentImagesUploader
            images={data.images}
            onChange={imgs => update('images', imgs)}
          />
        </div>

      </div>
    </div>
  )
}
