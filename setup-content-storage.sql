-- إعداد storage bucket للمحتوى المقترح

-- إنشاء bucket للصور المقترحة
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-images', 'content-images', true)
ON CONFLICT (id) DO NOTHING;

-- إعداد سياسة للعرض العام للصور
CREATE POLICY "Public read access for content images" ON storage.objects
FOR SELECT USING (bucket_id = 'content-images');

-- إعداد سياسة للرفع (للمصادقين فقط)
CREATE POLICY "Authenticated users can upload content images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'content-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = ''
);

-- إعداد سياسة للحذف (للمصادقين فقط)
CREATE POLICY "Authenticated users can delete their content images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'content-images'
  AND auth.role() = 'authenticated'
);

-- التحقق من وجود العمود proposed_images في جدول publish_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'publish_requests'
    AND column_name = 'proposed_images'
  ) THEN
    ALTER TABLE publish_requests
    ADD COLUMN proposed_images JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- التحقق من وجود العمود proposed_content في جدول publish_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'publish_requests'
    AND column_name = 'proposed_content'
  ) THEN
    ALTER TABLE publish_requests
    ADD COLUMN proposed_content TEXT;
  END IF;
END $$;

-- التحقق من وجود العمود content_sent_at في جدول publish_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'publish_requests'
    AND column_name = 'content_sent_at'
  ) THEN
    ALTER TABLE publish_requests
    ADD COLUMN content_sent_at TIMESTAMPTZ;
  END IF;
END $$;