-- Beacon ingest (Layer D) — parallel path. Do NOT reuse agent_traffic_*.
-- Same Supabase project as scanner; separate tables (beacon_*).
-- Pinned design: Beacon_Ingest_Contract_v1.md · scanner HEAD 1126a20.

-- Issued site keys. merchantId on events == site_key.
CREATE TABLE IF NOT EXISTS public.beacon_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key TEXT NOT NULL UNIQUE,
  label TEXT,
  allowed_origins TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beacon_sites_active_idx
  ON public.beacon_sites (active)
  WHERE active = true;

-- One row per checkout fill session. Counters stored so verdicts can be re-derived.
CREATE TABLE IF NOT EXISTS public.beacon_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id TEXT NOT NULL,
  site_id UUID NOT NULL REFERENCES public.beacon_sites (id),
  idempotency_key TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  provenance TEXT NOT NULL DEFAULT 'layer-d-behavioural',
  occurred_at TIMESTAMPTZ NOT NULL,
  origin TEXT NOT NULL,
  path TEXT NOT NULL,
  -- Key fired from an origin not in allowed_origins — keep the row, flag it.
  origin_mismatch BOOLEAN NOT NULL DEFAULT false,
  -- Raw Layer D counters (re-derivable)
  paste_fields INTEGER NOT NULL CHECK (paste_fields >= 0),
  unattributed_keydowns INTEGER NOT NULL CHECK (unattributed_keydowns >= 0),
  necessary_pass BOOLEAN NOT NULL,
  session_disqualified BOOLEAN NOT NULL,
  disqualify_reasons TEXT[] NOT NULL DEFAULT '{}',
  context_menu_count_in_fill INTEGER,
  pointer_right_count_in_fill INTEGER,
  long_touch_hold_count INTEGER,
  -- Verdict under the rule that produced schema_version / probeVersion
  verdict TEXT NOT NULL CHECK (
    verdict IN (
      'not-agent-necessary-fail',
      'not-agent-disqualifier',
      'inconclusive'
    )
  ),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS beacon_events_merchant_occurred_idx
  ON public.beacon_events (merchant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS beacon_events_verdict_occurred_idx
  ON public.beacon_events (verdict, occurred_at DESC);

COMMENT ON TABLE public.beacon_sites IS
  'Issued site keys for Layer D beacon. Identity is site_key, not domain.';
COMMENT ON TABLE public.beacon_events IS
  'Layer D behavioural fill events. Parallel to agent_traffic_reports (Layer A). Never sum unlabeled.';
COMMENT ON COLUMN public.beacon_events.provenance IS
  'Always layer-d-behavioural for this table. Declared-UA observations stay on Layer A.';
COMMENT ON COLUMN public.beacon_events.schema_version IS
  'Event contract version. Required from day one.';
