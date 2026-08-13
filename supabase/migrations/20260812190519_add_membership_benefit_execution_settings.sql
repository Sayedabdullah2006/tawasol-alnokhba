ALTER TABLE public.membership_request_benefits
  ADD COLUMN IF NOT EXISTS execution_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.reserve_membership_benefits(
  p_request_id uuid,
  p_benefits jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.publish_requests;
  v_item jsonb;
  v_type text;
  v_settings jsonb;
  v_wallet public.membership_benefit_wallets;
BEGIN
  SELECT * INTO v_request
  FROM public.publish_requests
  WHERE id = p_request_id AND billing_source = 'membership'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_request_not_found';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_benefits, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_item) = 'string' THEN
      v_type := trim(both '"' from v_item::text);
      v_settings := '{}'::jsonb;
    ELSE
      v_type := v_item->>'type';
      v_settings := COALESCE(v_item->'settings', '{}'::jsonb);
    END IF;

    IF v_type NOT IN ('reshare_quote', 'pin', 'paid_campaign') THEN
      RAISE EXCEPTION 'invalid_membership_benefit';
    END IF;

    IF v_type = 'reshare_quote' AND (
      COALESCE(v_settings->>'action', '') NOT IN ('reshare', 'quote') OR
      COALESCE((v_settings->>'delay_days')::integer, 0) NOT IN (1, 2)
    ) THEN
      RAISE EXCEPTION 'invalid_reshare_quote_settings';
    END IF;

    IF v_type = 'pin' AND COALESCE((v_settings->>'duration_hours')::integer, 0) <> 6 THEN
      RAISE EXCEPTION 'invalid_pin_settings';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.membership_request_benefits
      WHERE request_id = p_request_id
        AND benefit_type = v_type
        AND status IN ('reserved', 'consumed')
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_wallet
    FROM public.membership_benefit_wallets
    WHERE membership_id = v_request.membership_id
      AND benefit_type = v_type
      AND expires_at > now()
    FOR UPDATE;

    IF NOT FOUND OR v_wallet.total_units - v_wallet.reserved_units - v_wallet.used_units < 1 THEN
      RAISE EXCEPTION 'membership_benefit_unavailable:%', v_type;
    END IF;

    UPDATE public.membership_benefit_wallets
    SET reserved_units = reserved_units + 1, updated_at = now()
    WHERE id = v_wallet.id;

    INSERT INTO public.membership_request_benefits (
      membership_id,
      request_id,
      wallet_id,
      benefit_type,
      execution_settings
    ) VALUES (
      v_request.membership_id,
      p_request_id,
      v_wallet.id,
      v_type,
      v_settings
    )
    ON CONFLICT (request_id, benefit_type) DO UPDATE
      SET execution_settings = EXCLUDED.execution_settings,
          updated_at = now();

    INSERT INTO public.membership_benefit_ledger (
      membership_id,
      wallet_id,
      request_id,
      transaction_type,
      units,
      note,
      idempotency_key
    ) VALUES (
      v_request.membership_id,
      v_wallet.id,
      p_request_id,
      'reserve',
      -1,
      'حجز ميزة للطلب',
      'benefit-reserve:' || p_request_id::text || ':' || v_type
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_membership_benefits(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_membership_benefits(uuid, jsonb)
  TO service_role;
