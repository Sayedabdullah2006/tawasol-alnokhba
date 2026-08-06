CREATE TABLE IF NOT EXISTS public.first1_education_batches (
  batch_date DATE PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'creating' CHECK (state IN ('creating', 'scheduled', 'partial', 'failed')),
  scheduled_count SMALLINT NOT NULL DEFAULT 0 CHECK (scheduled_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.first1_education_batches ENABLE ROW LEVEL SECURITY;
