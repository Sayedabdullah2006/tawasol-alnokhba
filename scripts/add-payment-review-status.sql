-- Adds the payment_review status (set when user uploads transfer receipt,
-- before admin verifies and marks as paid).
-- Paste in Supabase Dashboard → SQL Editor → Run

ALTER TABLE publish_requests DROP CONSTRAINT IF EXISTS publish_requests_status_check;
ALTER TABLE publish_requests ADD CONSTRAINT publish_requests_status_check
  CHECK (status IN ('pending','quoted','approved','payment_review','paid','in_progress','completed','rejected'));
