-- Verification codes (register + password reset). Paste in Supabase SQL Editor.
-- TTL enforced by expires_at column (10 minutes set by the app).

CREATE TABLE IF NOT EXISTS auth_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code        text NOT NULL,
  purpose     text NOT NULL CHECK (purpose IN ('register', 'reset_password')),
  -- Pending registration payload (cleared after use)
  full_name   text,
  password    text,
  expires_at  timestamptz NOT NULL,
  used        boolean DEFAULT false,
  attempts    int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_codes_email_purpose_idx ON auth_codes(email, purpose);
CREATE INDEX IF NOT EXISTS auth_codes_expires_idx ON auth_codes(expires_at);

ALTER TABLE auth_codes ENABLE ROW LEVEL SECURITY;
-- No policy granted to anon/authenticated — only service role can read/write.
