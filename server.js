/**
 * AgentApt Phase 0 — hosted probe server.
 *
 * - Serves Harbour Lane Coffee static pages + probe.js
 * - Logs every inbound request (timestamp, path, UA, IP) for Layer B
 * - Exposes GET /probe-log?key=… (JSON) so Atlas favicon correlation
 *   does not depend on Render dashboard access
 *
 * Bind: process.env.PORT only (Render requirement).
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");

const PORT = Number(process.env.PORT);
if (!Number.isFinite(PORT) || PORT <= 0) {
  console.error("PORT must be set to a positive number (Render injects this).");
  process.exit(1);
}

const PROBE_LOG_KEY = process.env.PROBE_LOG_KEY || "phase0-change-me";
/** Issued site key — identity. Injected into page; also stamped on forward. */
const BEACON_SITE_KEY = process.env.BEACON_SITE_KEY || "";
/**
 * Scanner ingest URL, e.g. https://<host>/api/public/beacon
 * Server-to-server only — never injected into the page.
 */
const BEACON_UPSTREAM = process.env.BEACON_UPSTREAM || process.env.BEACON_ENDPOINT || "";
/**
 * Shared write credential for scanner route (x-beacon-secret).
 * Render env only — never in page source.
 */
const BEACON_INGEST_SECRET = process.env.BEACON_INGEST_SECRET || "";
const BEACON_FORWARD_ENABLED =
  Boolean(BEACON_SITE_KEY) && Boolean(BEACON_UPSTREAM) && Boolean(BEACON_INGEST_SECRET);
const MAX_LOG = 5_000;

/** @type {Array<{ t: string, ms: number, method: string, path: string, ua: string|null, ip: string|null, referer: string|null }>} */
const requestLog = [];
const startedAt = new Date().toISOString();

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || null;
}

function pushLog(req) {
  const entry = {
    t: new Date().toISOString(),
    ms: Date.now(),
    method: req.method,
    path: req.originalUrl || req.url,
    ua: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    ip: clientIp(req),
    referer: typeof req.headers.referer === "string" ? req.headers.referer : null,
  };
  requestLog.push(entry);
  if (requestLog.length > MAX_LOG) requestLog.splice(0, requestLog.length - MAX_LOG);
  return entry;
}

const app = express();

// Log first — before static — so favicon / page / probe.js all appear.
app.use((req, res, next) => {
  pushLog(req);
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    startedAt,
    logCount: requestLog.length,
    beaconForward: BEACON_FORWARD_ENABLED,
  });
});

/**
 * Same-origin beacon ingest for probe.js.
 * Page never sees BEACON_INGEST_SECRET. Probe stamps merchantId and forwards
 * server-to-server to the scanner /api/public/beacon with x-beacon-secret.
 */
app.post("/api/beacon", express.json({ limit: "64kb" }), async (req, res) => {
  if (!BEACON_FORWARD_ENABLED) {
    res.status(503).json({ ok: false, error: "beacon forward not configured" });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== "object") {
    res.status(400).json({ ok: false, error: "body must be an object" });
    return;
  }

  // Stamp identity from server env — browser cannot pick another merchant.
  const payload = {
    ...body,
    merchantId: BEACON_SITE_KEY,
  };

  try {
    const upstream = await fetch(BEACON_UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beacon-secret": BEACON_INGEST_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { ok: false, error: "upstream non-JSON", raw: text.slice(0, 200) };
    }
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: "upstream unreachable",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Protected JSON dump of the request log.
 * Example: /probe-log?key=…&sinceMs=…&q=Atlas&limit=200
 */
app.get("/probe-log", (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (key !== PROBE_LOG_KEY) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  let rows = requestLog.slice();
  const sinceMs = Number(req.query.sinceMs);
  if (Number.isFinite(sinceMs) && sinceMs > 0) {
    rows = rows.filter((r) => r.ms >= sinceMs);
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    rows = rows.filter((r) => re.test(r.ua || "") || re.test(r.path || ""));
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), MAX_LOG);
  if (rows.length > limit) rows = rows.slice(-limit);

  res.json({
    ok: true,
    startedAt,
    serverNow: new Date().toISOString(),
    totalLogged: requestLog.length,
    returned: rows.length,
    rows,
  });
});

app.post("/probe-log/clear", (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (key !== PROBE_LOG_KEY) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  requestLog.length = 0;
  res.json({ ok: true, cleared: true });
});

// Tiny favicon so Atlas Layer B has something to fetch (logged above).
app.get("/favicon.ico", (_req, res) => {
  // 1x1 PNG
  const buf = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(buf);
});

/**
 * Checkout pages: inject beacon config when forward path is configured.
 * Page only gets siteKey + same-origin /api/beacon — never the ingest secret.
 */
function beaconBootstrapScript() {
  if (!BEACON_FORWARD_ENABLED) return "";
  const cfg = JSON.stringify({
    siteKey: BEACON_SITE_KEY,
    endpoint: "/api/beacon",
  });
  return `<script>window.__AGENTAPT_BEACON__=${cfg};</script>\n`;
}

function serveCheckoutHtml(fileName) {
  return (_req, res) => {
    const filePath = path.join(PUBLIC, fileName);
    fs.readFile(filePath, "utf8", (err, html) => {
      if (err) {
        res.status(500).type("text").send("checkout unavailable");
        return;
      }
      const boot = beaconBootstrapScript();
      const out = boot
        ? html.replace(/<script src="\/probe\.js\?v=[^"]+"><\/script>/, `${boot}$&`)
        : html;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(out);
    });
  };
}

app.get("/checkout.html", serveCheckoutHtml("checkout.html"));
app.get("/checkout-controlled.html", serveCheckoutHtml("checkout-controlled.html"));
app.get("/checkout-typing-sim.html", serveCheckoutHtml("checkout-typing-sim.html"));

app.use(
  express.static(PUBLIC, {
    etag: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith("probe.js")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }),
);

app.listen(PORT, () => {
  console.log(`agentapt-phase0-probe listening on PORT=${PORT}`);
  console.log(`health: /health`);
  console.log(`request log: /probe-log?key=…`);
  console.log(`beacon forward: ${BEACON_FORWARD_ENABLED ? "ON → /api/beacon" : "off"}`);
});
