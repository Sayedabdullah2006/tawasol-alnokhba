CREATE TABLE public.inventor_store_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.publish_requests(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'in_progress', 'internal_review', 'ready_for_delivery', 'completed'
  )),
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  internal_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventor_store_workspaces_status_idx
  ON public.inventor_store_workspaces(status, updated_at DESC);

CREATE TABLE public.inventor_store_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.inventor_store_workspaces(id) ON DELETE CASCADE,
  deliverable_key text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'report', 'matrix', 'research', 'plan', 'document', 'infographic', 'presentation',
    'script', 'video', 'webpage', 'media_kit', 'partner_map', 'content_pack'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'drafting', 'internal_review', 'ready', 'sent', 'changes_requested', 'approved'
  )),
  sort_order integer NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_notes text,
  client_notes text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, deliverable_key)
);

CREATE INDEX inventor_store_deliverables_workspace_idx
  ON public.inventor_store_deliverables(workspace_id, sort_order);

CREATE TABLE public.inventor_store_deliverable_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid NOT NULL REFERENCES public.inventor_store_deliverables(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deliverable_id, version)
);

CREATE INDEX inventor_store_deliverable_versions_idx
  ON public.inventor_store_deliverable_versions(deliverable_id, version DESC);

ALTER TABLE public.inventor_store_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventor_store_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventor_store_deliverable_versions ENABLE ROW LEVEL SECURITY;

-- These records are an internal production area. The application accesses them only
-- from authenticated admin route handlers through the service role.
REVOKE ALL ON public.inventor_store_workspaces FROM anon, authenticated;
REVOKE ALL ON public.inventor_store_deliverables FROM anon, authenticated;
REVOKE ALL ON public.inventor_store_deliverable_versions FROM anon, authenticated;
GRANT ALL ON public.inventor_store_workspaces TO service_role;
GRANT ALL ON public.inventor_store_deliverables TO service_role;
GRANT ALL ON public.inventor_store_deliverable_versions TO service_role;

COMMENT ON TABLE public.inventor_store_workspaces IS 'Internal admin workspace for inventor-store service orders.';
COMMENT ON TABLE public.inventor_store_deliverables IS 'Service-specific outputs, review state, checklist and delivery files.';
COMMENT ON TABLE public.inventor_store_deliverable_versions IS 'Immutable snapshots retained before each deliverable update.';
