-- Persist admin "offer discount" emails so the same message can be resent via WhatsApp
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS offer_discount_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS offer_original_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS offer_discount_sent_at timestamptz;
