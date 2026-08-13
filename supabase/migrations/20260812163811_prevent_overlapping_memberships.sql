CREATE UNIQUE INDEX memberships_one_open_per_user_idx
  ON public.memberships(user_id)
  WHERE status IN ('pending_payment', 'payment_review', 'active', 'paused');
