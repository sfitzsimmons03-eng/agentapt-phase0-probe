-- Additive: first-party vs merchant source is orthogonal to Layer D verdict.
-- Do NOT put this on verdict or provenance.
-- NULL = unclassified. Detector (sandbox_runs correlation) comes later.
-- Client payloads must not set this column — ingest leaves it NULL.

ALTER TABLE public.beacon_events
  ADD COLUMN IF NOT EXISTS source_class TEXT NULL;

ALTER TABLE public.beacon_events
  ADD COLUMN IF NOT EXISTS webdriver BOOLEAN NULL;

COMMENT ON COLUMN public.beacon_events.source_class IS
  'Whose agent: NULL unclassified. Later values e.g. first-party-scan. Orthogonal to verdict. Never client-set.';
COMMENT ON COLUMN public.beacon_events.webdriver IS
  'navigator.webdriver from the page at emit. Optional. CDP/Playwright typically true. Not a first-party id by itself.';
