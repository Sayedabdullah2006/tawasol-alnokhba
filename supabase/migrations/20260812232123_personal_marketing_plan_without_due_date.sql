-- The personal marketing and editorial identity plan is an included membership
-- deliverable, not a date-bound recurring deliverable.
UPDATE public.membership_deliverables
SET due_at = NULL,
    updated_at = now()
WHERE deliverable_type = 'personal_marketing_plan'
  AND due_at IS NOT NULL;

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
      membership_id, deliverable_type, title
    ) VALUES (
      NEW.id,
      'personal_marketing_plan',
      'خطة التسويق الشخصي والهوية التحريرية'
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

REVOKE ALL ON FUNCTION public.seed_membership_deliverables() FROM PUBLIC, anon, authenticated;
