-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Quote Flow Migration
-- Adds admin-driven pricing workflow:
--   pending → quoted → approved → paid → in_progress → completed
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Expand status values
ALTER TABLE publish_requests DROP CONSTRAINT IF EXISTS publish_requests_status_check;
ALTER TABLE publish_requests ADD CONSTRAINT publish_requests_status_check
  CHECK (status IN ('pending','quoted','approved','paid','in_progress','completed','rejected'));

-- Quote columns
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS admin_quoted_price numeric;
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS admin_offered_extras jsonb DEFAULT '[]';
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS user_selected_extras jsonb DEFAULT '[]';
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS extras_selected_total numeric DEFAULT 0;
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS final_total numeric;
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS estimated_reach bigint DEFAULT 0;
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS quoted_at timestamptz;
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Channels selected by the user (e.g. ['x','ig'])
ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS channels jsonb DEFAULT '[]';
