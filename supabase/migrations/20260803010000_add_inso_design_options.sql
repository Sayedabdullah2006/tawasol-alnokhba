ALTER TABLE event_coverage_items
  ADD COLUMN IF NOT EXISTS design_options jsonb NOT NULL DEFAULT '[]'::jsonb;
