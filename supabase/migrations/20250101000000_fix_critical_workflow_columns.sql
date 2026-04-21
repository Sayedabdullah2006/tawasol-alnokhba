-- Fix Critical Workflow Issues - Add Missing Database Columns
-- This migration adds all columns referenced in the API code but missing from the database

-- Add all missing columns to publish_requests table
ALTER TABLE publish_requests

-- Quote rejection workflow
ADD COLUMN IF NOT EXISTS client_rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,

-- Negotiation workflow
ADD COLUMN IF NOT EXISTS negotiation_reason TEXT,
ADD COLUMN IF NOT EXISTS client_proposed_price NUMERIC,
ADD COLUMN IF NOT EXISTS negotiation_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS negotiated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS original_quoted_price NUMERIC,
ADD COLUMN IF NOT EXISTS negotiated_discount_percentage INTEGER,
ADD COLUMN IF NOT EXISTS negotiation_price_source TEXT CHECK (negotiation_price_source IN ('client_accepted', 'admin_discount')),

-- Content review workflow
ADD COLUMN IF NOT EXISTS proposed_content TEXT,
ADD COLUMN IF NOT EXISTS proposed_images JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS content_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS user_feedback TEXT,
ADD COLUMN IF NOT EXISTS feedback_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS content_approved_at TIMESTAMPTZ;

-- Update status constraint to include all workflow statuses
ALTER TABLE publish_requests DROP CONSTRAINT IF EXISTS publish_requests_status_check;
ALTER TABLE publish_requests ADD CONSTRAINT publish_requests_status_check
CHECK (status IN (
  'pending',        -- Initial state
  'quoted',         -- Quote sent to client
  'client_rejected',-- Client rejected the quote
  'negotiation',    -- Client requested price negotiation
  'approved',       -- Client approved quote (pending payment)
  'payment_review', -- Payment receipt uploaded, pending admin verification
  'paid',          -- Payment confirmed by admin
  'in_progress',   -- Work has started
  'content_review',-- Content sent to client for approval
  'completed',     -- Project completed
  'rejected'       -- Admin rejected the request
));

-- Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_publish_requests_status_created ON publish_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_publish_requests_user_status ON publish_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_publish_requests_negotiation ON publish_requests(status) WHERE status = 'negotiation';
CREATE INDEX IF NOT EXISTS idx_publish_requests_content_review ON publish_requests(status) WHERE status = 'content_review';

-- Add comments for documentation
COMMENT ON COLUMN publish_requests.client_rejection_reason IS 'Reason why client rejected the quote';
COMMENT ON COLUMN publish_requests.negotiation_reason IS 'Reason why client requested price negotiation';
COMMENT ON COLUMN publish_requests.client_proposed_price IS 'Price proposed by client during negotiation';
COMMENT ON COLUMN publish_requests.negotiation_price_source IS 'Whether final negotiated price came from client proposal or admin discount';
COMMENT ON COLUMN publish_requests.proposed_content IS 'Content proposed by admin for client review';
COMMENT ON COLUMN publish_requests.proposed_images IS 'Array of image URLs proposed by admin';
COMMENT ON COLUMN publish_requests.user_feedback IS 'Client feedback on proposed content';

-- Ensure RLS policies work with new columns
-- (Existing policies should automatically apply to new columns)

-- Add validation constraints
ALTER TABLE publish_requests ADD CONSTRAINT client_proposed_price_positive
  CHECK (client_proposed_price IS NULL OR client_proposed_price >= 0);

ALTER TABLE publish_requests ADD CONSTRAINT negotiated_discount_valid
  CHECK (negotiated_discount_percentage IS NULL OR (negotiated_discount_percentage >= 0 AND negotiated_discount_percentage <= 100));

-- Update any existing records that might have invalid status values (if any)
-- This is safe because we're only adding new allowed values to the constraint
UPDATE publish_requests SET status = 'pending' WHERE status NOT IN (
  'pending', 'quoted', 'client_rejected', 'negotiation', 'approved',
  'payment_review', 'paid', 'in_progress', 'content_review', 'completed', 'rejected'
);