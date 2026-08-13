CREATE OR REPLACE FUNCTION public.enforce_membership_request_review_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.billing_source = 'membership'
     AND OLD.membership_credit_status = 'reserved'
     AND NEW.membership_credit_status = 'reserved'
     AND NEW.status NOT IN ('pending', 'suspended') THEN
    RAISE EXCEPTION 'membership_request_requires_admin_review';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_membership_request_review_gate
  ON public.publish_requests;

CREATE TRIGGER enforce_membership_request_review_gate
BEFORE UPDATE OF status, membership_credit_status
ON public.publish_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_membership_request_review_gate();

REVOKE ALL ON FUNCTION public.enforce_membership_request_review_gate()
  FROM PUBLIC, anon, authenticated;
