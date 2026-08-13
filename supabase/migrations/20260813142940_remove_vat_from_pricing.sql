-- Prices in the platform are final amounts. Keep legacy monetary columns for
-- payment-provider and historical-schema compatibility, but do not split VAT.
UPDATE public.membership_plan_prices
SET subtotal = total_amount,
    vat_amount = 0,
    updated_at = now()
WHERE vat_amount <> 0 OR subtotal <> total_amount;

UPDATE public.memberships
SET subtotal = total_amount,
    vat_amount = 0,
    updated_at = now()
WHERE vat_amount <> 0 OR subtotal <> total_amount;

UPDATE public.membership_topups
SET subtotal = total_amount,
    vat_amount = 0,
    updated_at = now()
WHERE vat_amount <> 0 OR subtotal <> total_amount;

DO $$
BEGIN
  IF to_regclass('public.pricing_config') IS NOT NULL THEN
    UPDATE public.pricing_config
    SET vat_rate = 0,
        updated_at = now()
    WHERE vat_rate <> 0;
  END IF;
END
$$;
