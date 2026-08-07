UPDATE storage.buckets
SET
  file_size_limit = 209715200,
  allowed_mime_types = ARRAY[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
WHERE id = 'content-images';
