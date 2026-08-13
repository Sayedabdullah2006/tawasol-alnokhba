CREATE TABLE public.membership_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  deliverable_type text NOT NULL CHECK (deliverable_type IN (
    'personal_marketing_plan',
    'corporate_communications_plan',
    'editorial_calendar',
    'performance_report'
  )),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  period_start date,
  period_end date,
  due_at timestamptz,
  notes text,
  file_url text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX membership_deliverables_membership_idx
  ON public.membership_deliverables(membership_id, status, due_at);
CREATE UNIQUE INDEX membership_deliverables_one_time_idx
  ON public.membership_deliverables(membership_id, deliverable_type)
  WHERE period_start IS NULL;
CREATE UNIQUE INDEX membership_deliverables_period_idx
  ON public.membership_deliverables(membership_id, deliverable_type, period_start)
  WHERE period_start IS NOT NULL;

ALTER TABLE public.membership_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view own deliverables"
  ON public.membership_deliverables FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id = membership_id AND m.user_id = (SELECT auth.uid())
  ));
GRANT SELECT ON public.membership_deliverables TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_membership_deliverables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month integer;
  v_period_start date;
  v_period_end date;
BEGIN
  IF NEW.status <> 'active' OR OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_id = 'platinum' THEN
    INSERT INTO public.membership_deliverables (
      membership_id, deliverable_type, title, due_at
    ) VALUES (
      NEW.id,
      'personal_marketing_plan',
      'خطة التسويق الشخصي والهوية التحريرية',
      NEW.starts_at + interval '7 days'
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF NEW.plan_id = 'corporate' THEN
    INSERT INTO public.membership_deliverables (
      membership_id, deliverable_type, title, due_at
    ) VALUES (
      NEW.id,
      'corporate_communications_plan',
      'خطة الاتصال المؤسسي وتسويق القيادات والمنتجات',
      NEW.starts_at + interval '7 days'
    ) ON CONFLICT DO NOTHING;

    FOR v_month IN 0..(NEW.duration_months - 1) LOOP
      v_period_start := (NEW.starts_at::date + make_interval(months => v_month));
      v_period_end := (v_period_start + interval '1 month - 1 day')::date;

      INSERT INTO public.membership_deliverables (
        membership_id, deliverable_type, title, period_start, period_end, due_at
      ) VALUES (
        NEW.id,
        'editorial_calendar',
        'تقويم محتوى القيادات والمنتجات',
        v_period_start,
        v_period_end,
        v_period_start::timestamptz + interval '5 days'
      ) ON CONFLICT DO NOTHING;

      INSERT INTO public.membership_deliverables (
        membership_id, deliverable_type, title, period_start, period_end, due_at
      ) VALUES (
        NEW.id,
        'performance_report',
        'تقرير الأداء والتوصيات العملية',
        v_period_start,
        v_period_end,
        (v_period_end + 5)::timestamptz
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER seed_membership_deliverables_after_activation
AFTER UPDATE OF status ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.seed_membership_deliverables();

REVOKE ALL ON FUNCTION public.seed_membership_deliverables() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_membership_request(
  p_request_id uuid,
  p_admin_notes text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.publish_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.publish_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.billing_source <> 'membership' OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'membership_request_not_ready';
  END IF;
  IF v_request.membership_credit_status <> 'reserved' THEN
    RAISE EXCEPTION 'membership_credit_not_reserved';
  END IF;

  PERFORM public.consume_membership_credit(p_request_id);
  PERFORM public.consume_membership_benefits(p_request_id);

  UPDATE public.publish_requests
  SET status = 'in_progress',
      admin_notes = COALESCE(NULLIF(btrim(p_admin_notes), ''), admin_notes),
      last_status_change = now(),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_membership_request(
  p_request_id uuid,
  p_admin_notes text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.publish_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.publish_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.billing_source <> 'membership' OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'membership_request_not_ready';
  END IF;

  IF v_request.membership_credit_status = 'reserved' THEN
    PERFORM public.release_membership_credit(
      p_request_id,
      'إعادة الرصيد بعد رفض الطلب قبل بدء التنفيذ'
    );
    PERFORM public.release_membership_benefits(
      p_request_id,
      'إعادة المزايا بعد رفض الطلب قبل بدء التنفيذ'
    );
  END IF;

  UPDATE public.publish_requests
  SET status = 'rejected',
      admin_notes = COALESCE(NULLIF(btrim(p_admin_notes), ''), admin_notes),
      last_status_change = now(),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.start_membership_request(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_membership_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_membership_request(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_membership_request(uuid, text) TO service_role;
