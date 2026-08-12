CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.publish_requests(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('moyasar', 'tamara', 'manual')),
  provider_payment_id text,
  provider_refund_id text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  requested_by uuid REFERENCES public.profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_request_id ON public.payment_refunds(request_id);

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.publish_requests
  ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS refund_timing text,
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz;

ALTER TABLE public.publish_requests DROP CONSTRAINT IF EXISTS publish_requests_status_check;
ALTER TABLE public.publish_requests ADD CONSTRAINT publish_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'quoted'::text, 'client_rejected'::text, 'negotiation'::text,
    'approved'::text, 'payment_review'::text, 'paid'::text, 'in_progress'::text,
    'info_requested'::text, 'content_review'::text, 'changes_requested'::text,
    'scheduled'::text, 'suspended'::text, 'completed'::text, 'rejected'::text,
    'auto_closed'::text, 'cancelled'::text, 'refund_pending'::text, 'refunded'::text
  ]));
