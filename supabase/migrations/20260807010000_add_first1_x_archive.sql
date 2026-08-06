CREATE TABLE IF NOT EXISTS public.first1_x_archive_import_state (
  source TEXT PRIMARY KEY CHECK (source = 'first1saudi_x_archive'),
  next_start_date DATE NOT NULL DEFAULT DATE '2017-01-01',
  last_window_start DATE,
  last_window_end DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.first1_x_archive_posts (
  x_post_id TEXT PRIMARY KEY,
  post_url TEXT NOT NULL,
  post_text TEXT NOT NULL,
  created_at_x TIMESTAMPTZ NOT NULL,
  image_url TEXT,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  public_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_first1_x_archive_posts_created_at ON public.first1_x_archive_posts (created_at_x DESC);
CREATE INDEX IF NOT EXISTS idx_first1_x_archive_posts_image ON public.first1_x_archive_posts (created_at_x DESC) WHERE image_url IS NOT NULL;

ALTER TABLE public.first1_x_archive_import_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first1_x_archive_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.first1_x_archive_import_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.first1_x_archive_posts FROM anon, authenticated;
