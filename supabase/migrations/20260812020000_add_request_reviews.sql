CREATE TABLE IF NOT EXISTS public.request_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.publish_requests(id) ON DELETE CASCADE,
  review_token text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (char_length(comment) <= 1000),
  invitation_sent_at timestamptz,
  reminder_sent_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_reviews_token ON public.request_reviews(review_token);
CREATE INDEX IF NOT EXISTS idx_request_reviews_request_id ON public.request_reviews(request_id);

ALTER TABLE public.request_reviews ENABLE ROW LEVEL SECURITY;
