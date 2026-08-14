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
const BEACON_SITE_KEY = process.env.BEACON_SITE_KEY || "";
const BEACON_ENDPOINT = process.env.BEACON_ENDPOINT || "";
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
  res.json({ ok: true, startedAt, logCount: requestLog.length });
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
 * Checkout pages: inject beacon config when BEACON_SITE_KEY + BEACON_ENDPOINT
 * are set. Site key is an issued merchant id (not a domain hash).
 */
function beaconBootstrapScript() {
  if (!BEACON_SITE_KEY || !BEACON_ENDPOINT) return "";
  const cfg = JSON.stringify({
    siteKey: BEACON_SITE_KEY,
    endpoint: BEACON_ENDPOINT,
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
});
