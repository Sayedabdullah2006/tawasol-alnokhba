-- جدول أكواد الخصم
CREATE TABLE discount_codes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code        TEXT        UNIQUE NOT NULL,
  occasion    TEXT,
  discount_pct NUMERIC(5,2) NOT NULL CHECK (discount_pct > 0 AND discount_pct <= 100),
  expires_at  TIMESTAMPTZ NOT NULL,
  max_uses    INTEGER     DEFAULT NULL,
  used_count  INTEGER     DEFAULT 0 NOT NULL,
  is_active   BOOLEAN     DEFAULT true NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- أعمدة الخصم على جدول الطلبات
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS discount_code     TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discount_code_id  UUID        REFERENCES discount_codes(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discount_pct      NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discount_amount   NUMERIC(10,2) DEFAULT NULL;
