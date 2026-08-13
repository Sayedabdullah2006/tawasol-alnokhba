-- Repair only the Arabic ledger labels in functions deployed with mojibake.
DO $repair$
DECLARE
  v_function record;
  v_definition text;
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'activate_membership',
        'reserve_membership_credit',
        'consume_membership_credit',
        'release_membership_credit',
        'reserve_membership_benefits',
        'consume_membership_benefits',
        'release_membership_benefits'
      )
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := CASE v_function.proname
      WHEN 'activate_membership' THEN regexp_replace(
        v_definition,
        $$('grant',v_price\.included_credits,)'[^']*'(,'grant:')$$,
        $$\1'إضافة رصيد العضوية الكامل'\2$$
      )
      WHEN 'reserve_membership_credit' THEN regexp_replace(
        v_definition,
        $$('reserve',-p_credits,)'[^']*'(,'reserve:')$$,
        $$\1'حجز رصيد لطلب جديد'\2$$
      )
      WHEN 'consume_membership_credit' THEN regexp_replace(
        v_definition,
        $$('consume',-v_request\.membership_credits,)'[^']*'(,'consume:')$$,
        $$\1'بدء التنفيذ واستهلاك الرصيد'\2$$
      )
      WHEN 'release_membership_credit' THEN regexp_replace(
        v_definition,
        $$(COALESCE\(p_note,)'[^']*'(\),'release:')$$,
        $$\1'إعادة الرصيد المحجوز'\2$$
      )
      WHEN 'reserve_membership_benefits' THEN regexp_replace(
        v_definition,
        $$('reserve',-1,)'[^']*'(,'benefit-reserve:')$$,
        $$\1'حجز ميزة للطلب'\2$$
      )
      WHEN 'consume_membership_benefits' THEN regexp_replace(
        v_definition,
        $$('consume',-v_item\.units,)'[^']*'(,'benefit-consume:')$$,
        $$\1'بدء تنفيذ ميزة الطلب'\2$$
      )
      WHEN 'release_membership_benefits' THEN regexp_replace(
        v_definition,
        $$(COALESCE\(p_note,)'[^']*'(\),'benefit-release:')$$,
        $$\1'إعادة رصيد الميزة'\2$$
      )
      ELSE v_definition
    END;
    EXECUTE v_definition;
  END LOOP;
END;
$repair$;

UPDATE public.membership_credit_ledger
SET note = CASE transaction_type
  WHEN 'grant' THEN 'إضافة رصيد العضوية الكامل'
  WHEN 'reserve' THEN 'حجز رصيد لطلب جديد'
  WHEN 'consume' THEN 'بدء التنفيذ واستهلاك الرصيد'
  WHEN 'release' THEN 'إعادة الرصيد المحجوز'
  ELSE note
END
WHERE note IS NOT NULL
  AND (position('Ø' IN note) > 0 OR position('Ù' IN note) > 0);

UPDATE public.membership_benefit_ledger
SET note = CASE transaction_type
  WHEN 'reserve' THEN 'حجز ميزة للطلب'
  WHEN 'consume' THEN 'بدء تنفيذ ميزة الطلب'
  WHEN 'release' THEN 'إعادة رصيد الميزة'
  ELSE note
END
WHERE note IS NOT NULL
  AND (position('Ø' IN note) > 0 OR position('Ù' IN note) > 0);
