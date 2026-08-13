ALTER TABLE public.publish_requests
  ADD COLUMN IF NOT EXISTS supporting_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.publish_requests.supporting_documents IS
  'Supporting evidence uploaded for review only. These files must never be used as visual references for design generation.';

ALTER TABLE public.publish_requests
  DROP CONSTRAINT IF EXISTS publish_requests_supporting_documents_array;

ALTER TABLE public.publish_requests
  ADD CONSTRAINT publish_requests_supporting_documents_array
  CHECK (jsonb_typeof(supporting_documents) = 'array');

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE id = 'content-images';
