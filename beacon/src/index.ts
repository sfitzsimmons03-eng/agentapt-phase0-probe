/**
 * AgentApt Layer D beacon ingest.
 * POST /v1/beacon → public.beacon_events (scanner Supabase project).
 *
 * Parallel to agent-traffic/ (Layer A). Do not reuse ParsedRequest.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BEACON_SCHEMA_VERSION_DEFAULT?: string;
}

type Verdict =
  | "not-agent-necessary-fail"
  | "not-agent-disqualifier"
  | "inconclusive";

type DisqualifyReason = "contextmenu" | "pointer-right" | "long-touch-hold";

interface BeaconEventBody {
  schemaVersion: string;
  provenance: "layer-d-behavioural";
  idempotencyKey: string;
  merchantId: string;
  occurredAt: string;
  page: { origin: string; path: string };
  layerD: {
    pasteFields: number;
    unattributedKeydowns: number;
    necessaryPass: boolean;
    sessionDisqualified: boolean;
    disqualifyReasons: DisqualifyReason[];
    contextMenuCountInFill?: number;
    pointerRightCountInFill?: number;
    longTouchHoldCount?: number;
    verdict: Verdict;
  };
}

interface SiteRow {
  id: string;
  site_key: string;
  allowed_origins: string[] | null;
  active: boolean;
}

const VERDICTS = new Set<Verdict>([
  "not-agent-necessary-fail",
  "not-agent-disqualifier",
  "inconclusive",
]);

const REASONS = new Set<DisqualifyReason>([
  "contextmenu",
  "pointer-right",
  "long-touch-hold",
]);

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function corsHeaders(origin: string | null, allowed: boolean): HeadersInit {
  if (!origin || !allowed) {
    return {
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    };
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function isIsoDate(v: string): boolean {
  if (v.length < 10 || v.length > 64) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

function parseBody(raw: unknown): { ok: true; value: BeaconEventBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "body must be an object" };
  const o = raw as Record<string, unknown>;

  if (!isNonEmptyString(o.schemaVersion, 32)) return { ok: false, error: "schemaVersion required" };
  if (o.provenance !== "layer-d-behavioural") {
    return { ok: false, error: 'provenance must be "layer-d-behavioural"' };
  }
  if (!isNonEmptyString(o.idempotencyKey, 128)) return { ok: false, error: "idempotencyKey required" };
  if (!isNonEmptyString(o.merchantId, 200)) return { ok: false, error: "merchantId required" };
  if (!isNonEmptyString(o.occurredAt, 64) || !isIsoDate(o.occurredAt)) {
    return { ok: false, error: "occurredAt must be ISO-8601" };
  }

  const page = o.page;
  if (!page || typeof page !== "object") return { ok: false, error: "page required" };
  const p = page as Record<string, unknown>;
  if (!isNonEmptyString(p.origin, 2048)) return { ok: false, error: "page.origin required" };
  if (!isNonEmptyString(p.path, 2048)) return { ok: false, error: "page.path required" };

  const layerD = o.layerD;
  if (!layerD || typeof layerD !== "object") return { ok: false, error: "layerD required" };
  const d = layerD as Record<string, unknown>;

  if (!isInt(d.pasteFields) || d.pasteFields < 0 || d.pasteFields > 50) {
    return { ok: false, error: "layerD.pasteFields invalid" };
  }
  if (!isInt(d.unattributedKeydowns) || d.unattributedKeydowns < 0 || d.unattributedKeydowns > 100000) {
    return { ok: false, error: "layerD.unattributedKeydowns invalid" };
  }
  if (typeof d.necessaryPass !== "boolean") return { ok: false, error: "layerD.necessaryPass required" };
  if (typeof d.sessionDisqualified !== "boolean") {
    return { ok: false, error: "layerD.sessionDisqualified required" };
  }
  if (!Array.isArray(d.disqualifyReasons)) return { ok: false, error: "layerD.disqualifyReasons required" };
  if (d.disqualifyReasons.length > 16) return { ok: false, error: "layerD.disqualifyReasons too long" };
  const reasons: DisqualifyReason[] = [];
  for (const r of d.disqualifyReasons) {
    if (typeof r !== "string" || !REASONS.has(r as DisqualifyReason)) {
      return { ok: false, error: `invalid disqualifyReason: ${String(r)}` };
    }
    reasons.push(r as DisqualifyReason);
  }
  if (typeof d.verdict !== "string" || !VERDICTS.has(d.verdict as Verdict)) {
    return { ok: false, error: "layerD.verdict invalid" };
  }

  const optCount = (v: unknown): number | undefined => {
    if (v === undefined || v === null) return undefined;
    if (!isInt(v) || v < 0 || v > 100000) return undefined;
    return v;
  };

  return {
    ok: true,
    value: {
      schemaVersion: o.schemaVersion.trim(),
      provenance: "layer-d-behavioural",
      idempotencyKey: o.idempotencyKey.trim(),
      merchantId: o.merchantId.trim(),
      occurredAt: o.occurredAt.trim(),
      page: { origin: p.origin.trim(), path: p.path.trim() },
      layerD: {
        pasteFields: d.pasteFields,
        unattributedKeydowns: d.unattributedKeydowns,
        necessaryPass: d.necessaryPass,
        sessionDisqualified: d.sessionDisqualified,
        disqualifyReasons: reasons,
        contextMenuCountInFill: optCount(d.contextMenuCountInFill),
        pointerRightCountInFill: optCount(d.pointerRightCountInFill),
        longTouchHoldCount: optCount(d.longTouchHoldCount),
        verdict: d.verdict as Verdict,
      },
    },
  };
}

async function supabaseGetSite(
  env: Env,
  siteKey: string,
): Promise<{ ok: true; site: SiteRow } | { ok: false; status: number; error: string }> {
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/beacon_sites?site_key=eq.${encodeURIComponent(siteKey)}&select=id,site_key,allowed_origins,active&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    return { ok: false, status: 502, error: `site lookup failed (${res.status})` };
  }
  const rows = (await res.json()) as SiteRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, status: 401, error: "unknown site key" };
  }
  const site = rows[0];
  if (!site.active) return { ok: false, status: 401, error: "site key inactive" };
  return { ok: true, site };
}

function originAllowed(site: SiteRow, origin: string): boolean {
  const list = site.allowed_origins || [];
  return list.includes(origin);
}

async function insertEvent(
  env: Env,
  site: SiteRow,
  body: BeaconEventBody,
  originMismatch: boolean,
): Promise<{ ok: true; id: string; replay: boolean } | { ok: false; status: number; error: string }> {
  const row = {
    merchant_id: body.merchantId,
    site_id: site.id,
    idempotency_key: body.idempotencyKey,
    schema_version: body.schemaVersion,
    provenance: body.provenance,
    occurred_at: body.occurredAt,
    origin: body.page.origin,
    path: body.page.path,
    origin_mismatch: originMismatch,
    paste_fields: body.layerD.pasteFields,
    unattributed_keydowns: body.layerD.unattributedKeydowns,
    necessary_pass: body.layerD.necessaryPass,
    session_disqualified: body.layerD.sessionDisqualified,
    disqualify_reasons: body.layerD.disqualifyReasons,
    context_menu_count_in_fill: body.layerD.contextMenuCountInFill ?? null,
    pointer_right_count_in_fill: body.layerD.pointerRightCountInFill ?? null,
    long_touch_hold_count: body.layerD.longTouchHoldCount ?? null,
    verdict: body.layerD.verdict,
  };

  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/beacon_events`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=representation,resolution=ignore-duplicates",
      accept: "application/json",
    },
    body: JSON.stringify(row),
  });

  if (res.status === 201) {
    const inserted = (await res.json()) as Array<{ id: string }>;
    const id = inserted?.[0]?.id || "";
    return { ok: true, id, replay: false };
  }

  // PostgREST returns 200/empty or 409 depending on Prefer; treat unique conflict as replay.
  if (res.status === 200 || res.status === 409) {
    // Fetch existing id for stable response
    const q = `${url}?merchant_id=eq.${encodeURIComponent(body.merchantId)}&idempotency_key=eq.${encodeURIComponent(body.idempotencyKey)}&select=id&limit=1`;
    const existing = await fetch(q, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        accept: "application/json",
      },
    });
    if (existing.ok) {
      const rows = (await existing.json()) as Array<{ id: string }>;
      if (rows[0]?.id) return { ok: true, id: rows[0].id, replay: true };
    }
    return { ok: true, id: "", replay: true };
  }

  const text = await res.text();
  return { ok: false, status: 502, error: `insert failed (${res.status}): ${text.slice(0, 200)}` };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const reqOrigin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      // Preflight: reflect origin; real allowlist checked on POST after site lookup.
      const h = corsHeaders(reqOrigin, !!reqOrigin);
      return new Response(null, { status: 204, headers: h });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true, service: "agentapt-beacon", path: "/v1/beacon" });
    }

    if (request.method !== "POST" || url.pathname !== "/v1/beacon") {
      return json({ ok: false, error: "not found" }, 404);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "server misconfigured" }, 500);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return json({ ok: false, error: "invalid JSON" }, 400, corsHeaders(reqOrigin, !!reqOrigin));
    }

    const parsed = parseBody(raw);
    if (!parsed.ok) {
      return json({ ok: false, error: parsed.error }, 400, corsHeaders(reqOrigin, !!reqOrigin));
    }
    const body = parsed.value;

    const siteLookup = await supabaseGetSite(env, body.merchantId);
    if (!siteLookup.ok) {
      return json({ ok: false, error: siteLookup.error }, siteLookup.status, corsHeaders(reqOrigin, false));
    }
    const site = siteLookup.site;

    // Identity is site_key. Origin is a check, not identity.
    const eventOrigin = body.page.origin;
    const headerOriginOk = !reqOrigin || originAllowed(site, reqOrigin);
    const eventOriginOk = originAllowed(site, eventOrigin);
    const originMismatch = !eventOriginOk || (!!reqOrigin && !headerOriginOk);

    // CORS: only reflect Origin if it is on the allowlist for this key.
    const corsOk = !!reqOrigin && originAllowed(site, reqOrigin);
    const cors = corsHeaders(reqOrigin, corsOk);

    // Still accept and store mismatched origins (signal), but do not grant CORS
    // to unknown origins — browser clients off-allowlist can't read the response.
    const inserted = await insertEvent(env, site, body, originMismatch);
    if (!inserted.ok) {
      return json({ ok: false, error: inserted.error }, inserted.status, cors);
    }

    return json(
      {
        ok: true,
        id: inserted.id || null,
        replay: inserted.replay,
        originMismatch,
      },
      inserted.replay ? 200 : 201,
      cors,
    );
  },
};
