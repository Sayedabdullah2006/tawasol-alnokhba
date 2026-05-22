-- Add Tamara order tracking column
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS tamara_order_id text;

-- Index for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_publish_requests_tamara_order_id
  ON publish_requests (tamara_order_id)
  WHERE tamara_order_id IS NOT NULL;
