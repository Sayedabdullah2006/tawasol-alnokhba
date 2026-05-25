-- Add auto_closed to the status CHECK constraint
ALTER TABLE publish_requests DROP CONSTRAINT IF EXISTS publish_requests_status_check;
ALTER TABLE publish_requests ADD CONSTRAINT publish_requests_status_check
CHECK (status IN (
  'pending',
  'quoted',
  'client_rejected',
  'negotiation',
  'approved',
  'payment_review',
  'paid',
  'in_progress',
  'content_review',
  'completed',
  'rejected',
  'auto_closed'
));
