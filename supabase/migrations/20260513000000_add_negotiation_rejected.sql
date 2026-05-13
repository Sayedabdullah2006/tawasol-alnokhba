ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS negotiation_rejected boolean NOT NULL DEFAULT false;
