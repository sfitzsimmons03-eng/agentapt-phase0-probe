-- Optional client-reported fingerprint snapshot at beacon emit.
-- Diagnostic only — never an input to verdict (same rule as source_class).

ALTER TABLE public.beacon_events
  ADD COLUMN IF NOT EXISTS env JSONB NULL;

COMMENT ON COLUMN public.beacon_events.env IS
  'Optional probe env snapshot: pluginCount, webglRenderer, hardwareConcurrency, screen. Client-reported diagnostic; not used for verdict.';
