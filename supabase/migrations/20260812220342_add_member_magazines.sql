CREATE TABLE public.membership_magazines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL UNIQUE REFERENCES public.memberships(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  bio text CHECK (bio IS NULL OR char_length(bio) <= 500),
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX membership_magazines_share_token_idx
  ON public.membership_magazines (share_token)
  WHERE is_public;

ALTER TABLE public.membership_magazines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own magazine"
ON public.membership_magazines
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Members can update own magazine"
ON public.membership_magazines
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, UPDATE ON public.membership_magazines TO authenticated;

CREATE OR REPLACE FUNCTION public.create_membership_magazine()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.membership_magazines (membership_id, user_id, display_name, bio)
  VALUES (
    NEW.id,
    NEW.user_id,
    NEW.client_name,
    'مجلة رقمية توثق التصاميم والأعمال المعتمدة خلال العضوية.'
  )
  ON CONFLICT (membership_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_membership_magazine_after_insert
AFTER INSERT ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.create_membership_magazine();

REVOKE ALL ON FUNCTION public.create_membership_magazine()
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.membership_magazines (membership_id, user_id, display_name, bio)
SELECT
  membership.id,
  membership.user_id,
  membership.client_name,
  'مجلة رقمية توثق التصاميم والأعمال المعتمدة خلال العضوية.'
FROM public.memberships AS membership
ON CONFLICT (membership_id) DO NOTHING;

UPDATE public.membership_plans
SET features = features || '["مجلة شخصية للتصاميم المعتمدة برابط مشاركة عام"]'::jsonb,
    updated_at = now()
WHERE NOT features @> '["مجلة شخصية للتصاميم المعتمدة برابط مشاركة عام"]'::jsonb;
