-- Example seed for Harbour Lane Phase 0.
-- Replace SITE_KEY with a freshly issued opaque key; never commit a live key.
-- Apply after 001_beacon.sql.

INSERT INTO public.beacon_sites (site_key, label, allowed_origins, active)
VALUES (
  'REPLACE_WITH_ISSUED_SITE_KEY',
  'Harbour Lane Phase 0',
  ARRAY[
    'https://probe.agentapt.tech',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  true
)
ON CONFLICT (site_key) DO UPDATE
SET
  label = EXCLUDED.label,
  allowed_origins = EXCLUDED.allowed_origins,
  active = true,
  updated_at = now();
