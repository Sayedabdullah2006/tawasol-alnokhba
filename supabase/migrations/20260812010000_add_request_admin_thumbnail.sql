ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS admin_thumbnail_url text;
