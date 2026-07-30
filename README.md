# agentapt-phase0-probe

Hosted Phase 0 harness for AgentApt beacon validation (Layers B / C / D).

Not the production beacon. Capture + request log only.

## Run locally

```bash
npm install
cp .env.example .env   # set PROBE_LOG_KEY
PORT=3000 npm start
```

Open http://127.0.0.1:3000/

**PORT is required.** Do not hardcode a port — Render injects `PORT`.

## Endpoints

| Path | Purpose |
|------|---------|
| `/` `product.html` `checkout.html` | Harbour Lane Coffee probe pages |
| `/probe.js` | Page-side capture (Layer C/D) |
| `/favicon.ico` | Logged fetch target for Atlas Layer B |
| `/health` | Liveness |
| `/probe-log?key=…` | JSON request log (UA, path, IP, time) |
| `POST /probe-log/clear?key=…` | Clear in-memory log |

Optional query on `/probe-log`: `q=Atlas`, `sinceMs=`, `limit=`.

## Client retrieval

On a probe page DevTools console:

- `__probeSave()` / Ctrl+Shift+D — download JSON
- `__probeRecover()` — restore from localStorage after tab close
- `__probeReset()` — clear session + localStorage

Also see `public/RECOVER_PASTE.js`.

## Hosted retest checklist

1. Warm the URL once (~50s cold start on free Render).
2. Layer C — Comet agent drive; one run with DevTools → Sources open (HUMAN method).
3. Layer B — Atlas agent; then `/probe-log?key=…&q=Atlas` for favicon UA.
4. Chrome human baseline (2 profiles if testing extension absence).
5. Driver calibration — Browserbase against this origin.

## Env

| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` | yes | Set by Render; locally e.g. `3000` |
| `PROBE_LOG_KEY` | yes in prod | Shared secret for `/probe-log` |
