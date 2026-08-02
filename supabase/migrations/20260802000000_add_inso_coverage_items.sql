CREATE TABLE IF NOT EXISTS event_coverage_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key text NOT NULL,
  coverage_date date NOT NULL,
  phase text NOT NULL CHECK (phase IN ('before', 'during', 'after')),
  slot text NOT NULL,
  title text NOT NULL,
  brief text NOT NULL,
  post_text text,
  design_url text,
  design_brief text,
  publication_status text NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'ready', 'scheduled', 'published')),
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_key, coverage_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_event_coverage_items_campaign_date
  ON event_coverage_items (campaign_key, coverage_date, created_at);

ALTER TABLE event_coverage_items ENABLE ROW LEVEL SECURITY;
