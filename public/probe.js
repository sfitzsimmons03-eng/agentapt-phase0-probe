/* AgentApt Phase 0 probe harness — v17
 * Local capture always. Optional Layer D beacon POST when
 * window.__AGENTAPT_BEACON__ = { siteKey, endpoint } is set (Harbour Lane Phase 0).
 * No PII in beacon payload — verdict + counters only.
 * Must be loaded SYNCHRONOUSLY in <head> before any other script.
 * v15 shipped unified gesture disqualifier; v16 adds beacon emit;
 * v17 adds optional webdriver on the beacon payload (not source_class).
 */
(function () {
  'use strict';

  var KEY = 'agentapt_probe_v2';
  var T0 = Date.now();
  var PAGE = location.pathname;

  /* Visible-only-in-DOM marker so you can confirm load without DevTools APIs. */
  try { document.documentElement.setAttribute('data-agentapt-probe', '1'); } catch (e) {}

  /* ---------- accumulator (survives navigation within the session) ---------- */

  function load() {
    try {
      var fromSession = JSON.parse(sessionStorage.getItem(KEY));
      if (fromSession) return fromSession;
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function blank() {
    return {
      started: new Date().toISOString(),
      pages: [],
      env: null,
      resources: [],
      mutations: [],
      scriptLinks: [],
      globals: null,
      voices: null,
      extProbe: null,
    };
  }
  var S = load() || blank();

  function save() {
    try { recomputeLayerD(); } catch (e) { /* defined later in parse order for listeners; hoisted */ }
    var raw = JSON.stringify(S);
    try { sessionStorage.setItem(KEY, raw); } catch (e) { /* quota — ignore */ }
    /* Survive tab close when agents dismiss the window before a download fires. */
    try { localStorage.setItem(KEY, raw); } catch (e) { /* quota / private — ignore */ }
    try { maybeSendBeaconEvent(false); } catch (e) {}
  }

  var page = {
    path: PAGE,
    referrer: document.referrer || null,
    arrived: new Date().toISOString(),
    t0: T0,
    dwellMs: null,
    maxScrollPct: 0,
    scrollEvents: 0,
    pointerEvents: 0,
    clicks: [],
    fields: {},
    layerD: null,
    pointerDownLog: [],
    pointerStream: [],
    probeVersion: 17,
    beaconIdempotencyKey: null,
    beaconSentAt: null,
    beaconLastError: null
  };
  S.pages.push(page);

  /* ---------- Layer D: one-shot environment reads ---------- */

  if (!S.env) {
    var env = {};
    try { env.webdriver = navigator.webdriver; } catch (e) { env.webdriver = 'throw'; }
    try { env.ua = navigator.userAgent; } catch (e) {}
    try { env.uaData = navigator.userAgentData ? JSON.parse(JSON.stringify(navigator.userAgentData)) : null; } catch (e) { env.uaData = 'throw'; }
    try { env.platform = navigator.platform; } catch (e) {}
    try { env.languages = navigator.languages; } catch (e) {}
    try { env.hardwareConcurrency = navigator.hardwareConcurrency; } catch (e) {}
    try { env.deviceMemory = navigator.deviceMemory; } catch (e) {}
    try { env.pluginCount = navigator.plugins ? navigator.plugins.length : null; } catch (e) {}
    try { env.mimeTypeCount = navigator.mimeTypes ? navigator.mimeTypes.length : null; } catch (e) {}
    try { env.pdfViewerEnabled = navigator.pdfViewerEnabled; } catch (e) {}
    try { env.chromeObject = typeof window.chrome; } catch (e) {}
    try { env.chromeKeys = window.chrome ? Object.keys(window.chrome) : null; } catch (e) {}
    try { env.windowOuterZero = (window.outerWidth === 0 || window.outerHeight === 0); } catch (e) {}
    try { env.screen = { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight, dpr: window.devicePixelRatio }; } catch (e) {}
    try { env.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    try { env.notifPermission = (window.Notification && Notification.permission) || null; } catch (e) {}

    // WebGL renderer string — headless and virtualised stacks often differ
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        env.webgl = dbg ? { vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) } : 'no-debug-ext';
      } else { env.webgl = 'no-context'; }
    } catch (e) { env.webgl = 'throw'; }

    // Serialised-stack access counter. Known CDP tell, known fragile.
    // If a devtools/CDP client serialises errors, the getter fires unprompted.
    try {
      var hits = 0;
      var err = new Error('probe');
      Object.defineProperty(err, 'stack', { get: function () { hits++; return ''; }, configurable: true });
      void err.stack;                       // our own read = 1
      setTimeout(function () { S.env.stackGetterHits = hits; save(); }, 3000);
    } catch (e) {}

    S.env = env;
  }

  /* ---------- Layer D: speechSynthesis voice list (async) ---------- */

  function readVoices(tag) {
    try {
      if (!window.speechSynthesis) { S.voices = { available: false }; save(); return; }
      var v = speechSynthesis.getVoices() || [];
      S.voices = {
        available: true,
        at: tag,
        count: v.length,
        names: v.slice(0, 60).map(function (x) { return x.name + ' | ' + x.lang + (x.localService ? ' | local' : ' | remote'); }),
        hasGoogleVoices: v.some(function (x) { return /^Google /.test(x.name); })
      };
      save();
    } catch (e) { S.voices = { available: 'throw' }; save(); }
  }
  readVoices('immediate');
  try { speechSynthesis.onvoiceschanged = function () { readVoices('onvoiceschanged'); }; } catch (e) {}
  setTimeout(function () { readVoices('t+2000'); }, 2000);

  /* ---------- Layer D: default-extension absence probe ---------- */
  /* WEAKEST SIGNAL IN THE SET. Component-extension resources are not
   * reliably web-accessible, so a uniform "blocked" result across all
   * browsers means the probe discriminates nothing. Report that outcome
   * plainly rather than tuning it into looking useful. */

  var STOCK_IDS = [
    ['mhjfbmdgcfjbbpaeojofohoefgiehjai', 'Chrome PDF Viewer'],
    ['nkeimhogjdpnpccoofpliimaahmaaome', 'Google Hangouts/Meet'],
    ['pkedcjkdefgpdelpbcmbmeomcjbeemfm', 'Chrome Cast'],
    ['neajdppkdcdipfabeoofebfddakdcjhd', 'Google Network Speech']
  ];
  (function () {
    var out = [];
    var pending = STOCK_IDS.length;
    STOCK_IDS.forEach(function (pair) {
      var img = new Image();
      var done = false;
      var finish = function (result) {
        if (done) return; done = true;
        out.push({ id: pair[0], name: pair[1], result: result });
        if (--pending === 0) { S.extProbe = out; save(); }
      };
      img.onload = function () { finish('load'); };
      img.onerror = function () { finish('error'); };
      setTimeout(function () { finish('timeout'); }, 2500);
      try { img.src = 'chrome-extension://' + pair[0] + '/favicon.ico'; } catch (e) { finish('throw'); }
    });
  })();

  /* ---------- Layer C: resource origins (the high-value capture) ---------- */
  /* Deliberately schema-agnostic: capture EVERY non-http(s) scheme rather
   * than matching chrome-extension:// specifically. Comet may use its own
   * scheme, and a hardcoded match would silently miss it. This instrument
   * fails toward capturing too much — the inverse of the driver's gates,
   * because over-capture costs review time while under-capture costs the
   * whole finding. */

  function noteResource(name, initiator) {
    if (!name) return;
    if (/^https?:/i.test(name) || name.indexOf('/') === 0) return;   // ordinary page traffic
    if (/^(data|blob|about):/i.test(name)) return;                    // benign, high volume
    S.resources.push({ url: String(name).slice(0, 400), initiator: initiator || null, at: Date.now() - T0, page: PAGE });
    save();
  }

  try {
    performance.getEntriesByType('resource').forEach(function (e) { noteResource(e.name, e.initiatorType); });
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) { noteResource(e.name, e.initiatorType); });
    }).observe({ type: 'resource', buffered: true });
  } catch (e) {}

  /* ---------- Layer C: injected node capture ---------- */

  function describe(node) {
    if (!node || node.nodeType !== 1) return null;
    var d = { tag: node.tagName, at: Date.now() - T0, page: PAGE };
    try { if (node.id) d.id = node.id; } catch (e) {}
    try { if (node.className && typeof node.className === 'string') d.cls = node.className.slice(0, 200); } catch (e) {}
    try { if (node.src) d.src = String(node.src).slice(0, 400); } catch (e) {}
    try { if (node.href) d.href = String(node.href).slice(0, 400); } catch (e) {}
    try { if (node.shadowRoot) d.hasShadowRoot = true; } catch (e) {}
    try {
      var attrs = {};
      for (var i = 0; i < node.attributes.length; i++) {
        var a = node.attributes[i];
        attrs[a.name] = String(a.value).slice(0, 120);
      }
      d.attrs = attrs;
    } catch (e) {}
    try {
      var cs = getComputedStyle(node);
      d.style = { position: cs.position, zIndex: cs.zIndex, pointerEvents: cs.pointerEvents };
    } catch (e) {}
    return d;
  }

  /* Ours-vs-theirs: nodes the page itself creates are noise. Anything added
   * outside <body>'s normal subtree, or carrying a non-http scheme, or
   * sitting at a very high z-index, is worth flagging. Capture broadly and
   * let the reviewer sort it. */
  try {
    var mo = new MutationObserver(function (records) {
      records.forEach(function (r) {
        for (var i = 0; i < r.addedNodes.length; i++) {
          var d = describe(r.addedNodes[i]);
          if (!d) continue;
          d.parent = (r.target && r.target.nodeName) || null;
          var suspicious =
            (d.src && !/^https?:/i.test(d.src) && !/^(data|blob):/i.test(d.src)) ||
            (d.href && !/^https?:/i.test(d.href) && !/^(data|blob|mailto|tel|#):/i.test(d.href)) ||
            (d.style && parseInt(d.style.zIndex, 10) > 9000) ||
            d.parent === "HTML" ||
            d.hasShadowRoot === true;
          d.flagged = !!suspicious;
          if (S.mutations.length < 4000) S.mutations.push(d);
        }
      });
      save();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* ---------- Layer C: script / link insertions (transient inject catch) ---------- */
  /* Dedicated channel: Comet may inject a <script>/<link> at action time and
   * remove it before the next coarse snapshot. Log src / href / content hash
   * / timestamp on add AND remove. Page-context only — content-script worlds
   * remain invisible; DevTools Sources check is still required once. */

  if (!Array.isArray(S.scriptLinks)) S.scriptLinks = [];

  function hashText(s) {
    try {
      var h = 0;
      var str = String(s || "");
      for (var i = 0; i < str.length && i < 4000; i++) {
        h = (h * 31 + str.charCodeAt(i)) | 0;
      }
      return "h" + (h >>> 0).toString(16);
    } catch (e) {
      return null;
    }
  }

  function describeScriptLink(node, action) {
    if (!node || node.nodeType !== 1) return null;
    var tag = node.tagName;
    if (tag !== "SCRIPT" && tag !== "LINK") return null;
    var d = {
      action: action,
      tag: tag,
      at: Date.now() - T0,
      page: PAGE,
      src: null,
      href: null,
      type: null,
      rel: null,
      contentHash: null,
      contentLen: null,
    };
    try {
      if (node.src) d.src = String(node.src).slice(0, 500);
    } catch (e) {}
    try {
      if (node.href) d.href = String(node.href).slice(0, 500);
    } catch (e) {}
    try {
      if (node.type) d.type = String(node.type).slice(0, 80);
    } catch (e) {}
    try {
      if (node.rel) d.rel = String(node.rel).slice(0, 80);
    } catch (e) {}
    try {
      if (tag === "SCRIPT" && !d.src) {
        var txt = node.textContent || "";
        d.contentLen = txt.length;
        d.contentHash = hashText(txt);
      }
    } catch (e) {}
    return d;
  }

  function walkAdded(node, action) {
    var d = describeScriptLink(node, action);
    if (d) {
      if (S.scriptLinks.length < 2000) S.scriptLinks.push(d);
      return;
    }
    try {
      if (node && node.querySelectorAll) {
        var found = node.querySelectorAll("script, link");
        for (var i = 0; i < found.length; i++) {
          var inner = describeScriptLink(found[i], action);
          if (inner && S.scriptLinks.length < 2000) S.scriptLinks.push(inner);
        }
      }
    } catch (e) {}
  }

  try {
    var moSL = new MutationObserver(function (records) {
      records.forEach(function (r) {
        for (var i = 0; i < r.addedNodes.length; i++) walkAdded(r.addedNodes[i], "add");
        for (var j = 0; j < r.removedNodes.length; j++) walkAdded(r.removedNodes[j], "remove");
      });
      save();
    });
    moSL.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* ---------- Layer C: window global delta ---------- */

  try {
    var baseline = Object.keys(window);
    setTimeout(function () {
      try {
        var now = Object.keys(window);
        var added = now.filter(function (k) { return baseline.indexOf(k) === -1; });
        S.globals = { baselineCount: baseline.length, added: added.slice(0, 200) };
        save();
      } catch (e) {}
    }, 5000);
  } catch (e) {}

  /* ---------- Layer D: behavioural shape ---------- */

  var lastScroll = 0;
  addEventListener('scroll', function () {
    page.scrollEvents++;
    try {
      var h = document.documentElement.scrollHeight - innerHeight;
      var pct = h > 0 ? Math.round((scrollY / h) * 100) : 0;
      if (pct > page.maxScrollPct) page.maxScrollPct = pct;
    } catch (e) {}
    var now = Date.now();
    if (now - lastScroll > 500) { lastScroll = now; save(); }
  }, { passive: true });

  addEventListener('pointermove', function () { page.pointerEvents++; }, { passive: true });

  addEventListener('click', function (e) {
    var t = e.target || {};
    page.clicks.push({
      at: Date.now() - T0,
      tag: t.tagName || null,
      text: (t.innerText || t.value || '').slice(0, 60),
      trusted: e.isTrusted,
      x: e.clientX, y: e.clientY
    });
    save();
  }, true);

  /* Form-fill cadence. Document capture so React/controlled mounts
   * (inputs appear after DOMContentLoaded) still count. */
  /* Keydowns within this window after a paste on the same field are
   * attributed to the paste (mask typing-sim), not counted as user typing. */
  var PASTE_ATTR_WINDOW_MS = 500;
  /* Per-field contextmenu→paste lookback — DIAGNOSTIC ONLY.
   * Session verdict no longer uses this window (see recomputeLayerD).
   * Kept so Arm F can compare per-field vs windowless session rules. */
  var PASTE_CONTEXT_LOOKBACK_MS = 2000;
  /* Gesture disqualifier (v14 shipped): contextmenu / button===2 in fill
   * span OR trusted touch hold ≥400ms within 2000ms before paste. */
  var GESTURE_TOUCH_HOLD_MIN_MS = 400;
  var GESTURE_LOOKBACK_MS = 2000;
  var POINTER_STREAM_MAX = 400;
  var POINTER_STREAM_PASTE_WINDOW_MS = 5000;
  /* Harbour Lane shared address fields — necessary-condition scope. */
  var LAYER_D_SHARED = ['name', 'email', 'address', 'city', 'postcode'];

  function recomputeLayerD() {
    var fields = page.fields || {};
    var pasteFields = 0;
    var unattr = 0;
    var disqualifiedFields = [];
    var allMenus = [];
    var allRights = [];
    var pointerHoldCount = 0;
    var pointerDownCount = 0;
    var firstFocusAt = null;
    var lastPasteAt = null;
    var name;
    for (name in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, name)) continue;
      var f = fields[name];
      if (!f) continue;
      if (f.pasteDisqualified) disqualifiedFields.push(name);
      var j;
      for (j = 0; j < (f.contextMenus || []).length; j++) {
        allMenus.push({ field: name, at: f.contextMenus[j].at });
      }
      for (j = 0; j < (f.pointerDownRight || []).length; j++) {
        allRights.push({ field: name, at: f.pointerDownRight[j].at });
      }
      pointerHoldCount += (f.pointerHolds || []).length;
      pointerDownCount += (f.pointerDownCount || 0);
      if (f.firstFocusAt != null) {
        if (firstFocusAt == null || f.firstFocusAt < firstFocusAt) firstFocusAt = f.firstFocusAt;
      }
      if (f.lastPasteAt != null) {
        if (lastPasteAt == null || f.lastPasteAt > lastPasteAt) lastPasteAt = f.lastPasteAt;
      }
    }
    var i;
    for (i = 0; i < LAYER_D_SHARED.length; i++) {
      name = LAYER_D_SHARED[i];
      f = fields[name];
      if (!f) continue;
      if ((f.pastes || 0) >= 1 || f.pasteObserved) pasteFields++;
      unattr += f.keydownsUnattributed || 0;
    }
    var necessaryPass = pasteFields >= 4 && unattr <= 3;

    /* Session disqualifier: ANY contextmenu or button===2 between first
     * field focus and last paste of the fill — NO per-field lookback.
     * Stray right-click in that window errs toward not-agent. */
    function inFillWindow(at) {
      if (at == null) return false;
      if (firstFocusAt != null && at < firstFocusAt) return false;
      if (lastPasteAt != null && at > lastPasteAt) return false;
      /* If we have pastes but no focus yet, still count events up to last paste. */
      if (firstFocusAt == null && lastPasteAt != null && at > lastPasteAt) return false;
      return firstFocusAt != null || lastPasteAt != null;
    }
    var menusInFill = [];
    var rightsInFill = [];
    for (i = 0; i < allMenus.length; i++) {
      if (inFillWindow(allMenus[i].at)) menusInFill.push(allMenus[i]);
    }
    for (i = 0; i < allRights.length; i++) {
      if (inFillWindow(allRights[i].at)) rightsInFill.push(allRights[i]);
    }
    var sessionDisqualifiedContextMenuOnly = menusInFill.length > 0 || rightsInFill.length > 0;
    /* v14 shipped: unified gesture disqualifier. */
    var gestureDisqualifiedFields = [];
    var longTouchHoldsInFill = [];
    for (i = 0; i < LAYER_D_SHARED.length; i++) {
      name = LAYER_D_SHARED[i];
      f = fields[name];
      if (!f || !f.lastPasteAt) continue;
      var pasteAt = f.lastPasteAt;
      if (!inFillWindow(pasteAt)) continue;
      var hitLong = longTouchHoldBeforePaste(f, pasteAt);
      if (hitLong) {
        longTouchHoldsInFill.push({ field: name, at: hitLong.upAt, dwellMs: hitLong.dwellMs, pasteAt: pasteAt });
      }
      var fieldGesture = false;
      if (anyInLookback(f.contextMenus || [], pasteAt, GESTURE_LOOKBACK_MS)) fieldGesture = true;
      if (anyInLookback(f.pointerDownRight || [], pasteAt, GESTURE_LOOKBACK_MS)) fieldGesture = true;
      if (hitLong) fieldGesture = true;
      if (fieldGesture) gestureDisqualifiedFields.push(name);
    }
    var sessionGestureDisqualified =
      sessionDisqualifiedContextMenuOnly ||
      gestureDisqualifiedFields.length > 0 ||
      longTouchHoldsInFill.length > 0;
    var sessionDisqualified = sessionGestureDisqualified;
    /* Old path: per-field lookback hit on any field (diagnostic compare). */
    var sessionDisqualifiedPerFieldLookback = disqualifiedFields.length > 0;

    var verdict;
    if (!necessaryPass) verdict = 'not-agent-necessary-fail';
    else if (sessionDisqualified) verdict = 'not-agent-disqualifier';
    else verdict = 'inconclusive';

    var gestureVerdict = verdict;

    page.layerD = {
      sharedFields: LAYER_D_SHARED.slice(),
      pasteFields: pasteFields,
      unattributedKeydowns: unattr,
      necessaryPass: necessaryPass,
      /* Diagnostic: fields that hit the 2000ms per-field lookback. */
      disqualifiedFieldsPerFieldLookback: disqualifiedFields,
      perFieldLookbackMs: PASTE_CONTEXT_LOOKBACK_MS,
      /* Session verdict inputs (windowless fill span). */
      fillFirstFocusAt: firstFocusAt,
      fillLastPasteAt: lastPasteAt,
      contextMenusInFill: menusInFill,
      pointerRightInFill: rightsInFill,
      contextMenuCountInFill: menusInFill.length,
      pointerRightCountInFill: rightsInFill.length,
      sessionDisqualified: sessionDisqualified,
      sessionDisqualifiedContextMenuOnly: sessionDisqualifiedContextMenuOnly,
      sessionDisqualifiedPerFieldLookback: sessionDisqualifiedPerFieldLookback,
      /* Pointer-capture health counters. */
      pointerDownCount: pointerDownCount,
      pointerHoldCount: pointerHoldCount,
      pasteAttrWindowMs: PASTE_ATTR_WINDOW_MS,
      verdict: verdict,
      /* v14 shipped: unified gesture disqualifier is `verdict`. */
      gestureTouchHoldMinMs: GESTURE_TOUCH_HOLD_MIN_MS,
      gestureLookbackMs: GESTURE_LOOKBACK_MS,
      gestureDisqualifiedFields: gestureDisqualifiedFields,
      longTouchHoldsInFill: longTouchHoldsInFill,
      sessionGestureDisqualified: sessionGestureDisqualified,
      gestureVerdict: gestureVerdict,
      pointerStreamCount: (page.pointerStream || []).length
    };
  }

  function fieldRec(el) {
    var name = el.name || el.id || el.type || 'field';
    if (!page.fields[name]) {
      page.fields[name] = {
        events: 0, firstAt: null, lastAt: null, finalLength: 0,
        keydowns: 0, pastes: 0, gaps: [], _prev: null,
        firstFocusAt: null,
        /* Paste survival (mask/controlled may swallow or rewrite). */
        pasteObserved: false,
        pasteDetails: [],
        lastPasteAt: null,
        /* Paste-aware keydown accounting. */
        keydownOffsetsFromPaste: [],
        keydownsAttributed: 0,
        keydownsUnattributed: 0,
        /* Context-menu / right-click disqualifier + raw pointer hold. */
        contextMenus: [],
        pointerDownRight: [],
        pointerDownCount: 0,
        pointerHolds: [],
        openPointerDowns: [],
        pointerStream: [],
        gestureDisqualified: false,
        /* Diagnostic only — per-field 2000ms lookback. */
        pasteDisqualified: false,
        pasteDisqualifyReasons: []
      };
    }
    return page.fields[name];
  }
  function isFormControl(el) {
    return el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '');
  }
  function digitsOnly(s) {
    return String(s || '').replace(/\D/g, '');
  }
  function clipText(e) {
    try {
      var cd = e.clipboardData || window.clipboardData;
      if (!cd) return null;
      return cd.getData('text') || cd.getData('text/plain') || '';
    } catch (err) {
      return null;
    }
  }
  function anyInLookback(list, pasteAt, windowMs) {
    var i;
    for (i = 0; i < list.length; i++) {
      var at = list[i] && list[i].at;
      if (at == null) continue;
      if (at <= pasteAt && (pasteAt - at) <= windowMs) return list[i];
    }
    return null;
  }
  function targetDesc(el) {
    if (!el || !el.tagName) return { tag: null };
    var d = {
      tag: el.tagName,
      name: el.name || null,
      id: el.id || null,
      type: el.type || null
    };
    try {
      if (el.getAttribute) d.role = el.getAttribute('role');
      if (el.className) d.className = String(el.className).slice(0, 80);
    } catch (err) {}
    return d;
  }
  function pushPointerStream(entry) {
    if (!page.pointerStream) page.pointerStream = [];
    if (page.pointerStream.length >= POINTER_STREAM_MAX) page.pointerStream.shift();
    page.pointerStream.push(entry);
  }
  function streamBeforeAt(at, windowMs, fieldName) {
    var stream = page.pointerStream || [];
    var out = [];
    var i;
    for (i = 0; i < stream.length; i++) {
      var ev = stream[i];
      if (ev.at > at) continue;
      if ((at - ev.at) > windowMs) continue;
      if (fieldName && ev.field && ev.field !== fieldName) continue;
      out.push(ev);
    }
    return out;
  }
  function longTouchHoldBeforePaste(rec, pasteAt) {
    var holds = rec.pointerHolds || [];
    var i;
    for (i = 0; i < holds.length; i++) {
      var h = holds[i];
      if (!h.trusted || h.pointerType !== 'touch') continue;
      if ((h.dwellMs || 0) < GESTURE_TOUCH_HOLD_MIN_MS) continue;
      var up = h.upAt != null ? h.upAt : h.at;
      if (up == null || up > pasteAt) continue;
      if ((pasteAt - up) <= GESTURE_LOOKBACK_MS) return h;
    }
    return null;
  }
  function attachPasteDisqualify(rec, detail, pasteAt) {
    var hitMenu = anyInLookback(rec.contextMenus || [], pasteAt, PASTE_CONTEXT_LOOKBACK_MS);
    var hitRight = anyInLookback(rec.pointerDownRight || [], pasteAt, PASTE_CONTEXT_LOOKBACK_MS);
    detail.contextMenuBefore = !!hitMenu;
    detail.pointerRightBefore = !!hitRight;
    detail.contextMenuOffsetMs = hitMenu ? (pasteAt - hitMenu.at) : null;
    detail.pointerRightOffsetMs = hitRight ? (pasteAt - hitRight.at) : null;
    detail.disqualified = !!(hitMenu || hitRight);
    detail.disqualifyReasons = [];
    if (hitMenu) detail.disqualifyReasons.push('contextmenu');
    if (hitRight) detail.disqualifyReasons.push('pointerdown-button-2');
    if (detail.disqualified) {
      rec.pasteDisqualified = true;
      if (hitMenu && rec.pasteDisqualifyReasons.indexOf('contextmenu') < 0) {
        rec.pasteDisqualifyReasons.push('contextmenu');
      }
      if (hitRight && rec.pasteDisqualifyReasons.indexOf('pointerdown-button-2') < 0) {
        rec.pasteDisqualifyReasons.push('pointerdown-button-2');
      }
    }
  }
  function attachGestureAnalysis(rec, detail, pasteAt, fieldName) {
    attachPasteDisqualify(rec, detail, pasteAt);
    var hitLongTouch = longTouchHoldBeforePaste(rec, pasteAt);
    var streamField = streamBeforeAt(pasteAt, GESTURE_LOOKBACK_MS, fieldName);
    var streamWide = streamBeforeAt(pasteAt, POINTER_STREAM_PASTE_WINDOW_MS, null);
    detail.longTouchHoldBefore = !!hitLongTouch;
    detail.longTouchHoldOffsetMs = hitLongTouch ? (pasteAt - hitLongTouch.upAt) : null;
    detail.longTouchDwellMs = hitLongTouch ? hitLongTouch.dwellMs : null;
    if (hitLongTouch && detail.disqualifyReasons.indexOf('long-touch-hold') < 0) {
      detail.disqualifyReasons.push('long-touch-hold');
    }
    detail.gestureDisqualified = detail.disqualified || !!hitLongTouch;
    detail.pointerStreamBeforePaste = streamField;
    detail.pointerStreamWideBeforePaste = streamWide;
    var trustedDowns = [];
    var j;
    for (j = 0; j < streamField.length; j++) {
      if (streamField[j].type === 'pointerdown' && streamField[j].trusted) trustedDowns.push(streamField[j]);
    }
    detail.trustedPointerDownsBeforePaste = trustedDowns.length;
    if (detail.gestureDisqualified) {
      rec.gestureDisqualified = true;
      if (hitLongTouch && rec.pasteDisqualifyReasons.indexOf('long-touch-hold') < 0) {
        rec.pasteDisqualifyReasons.push('long-touch-hold');
      }
    }
  }
  function recordPasteOutcome(el, rec, detail, attempt) {
    try {
      var landed = String(el.value || '');
      detail.valueAfter = landed;
      detail.valueAfterLen = landed.length;
      detail.exactMatch = detail.clipboard != null && landed === detail.clipboard;
      detail.digitsMatch =
        detail.clipboard != null &&
        digitsOnly(landed).length > 0 &&
        digitsOnly(landed) === digitsOnly(detail.clipboard);
      detail.attempt = attempt;
      /* Keep last outcome on the field for quick table reads. */
      rec.pasteExactMatch = detail.exactMatch;
      rec.pasteDigitsMatch = detail.digitsMatch;
      rec.pasteValueAfter = landed;
      save();
    } catch (err) {}
  }
  addEventListener('focusin', function (e) {
    if (!isFormControl(e.target)) return;
    var rec = fieldRec(e.target);
    var t = Date.now() - T0;
    if (rec.firstFocusAt == null) rec.firstFocusAt = t;
    save();
  }, true);
  addEventListener('contextmenu', function (e) {
    var t = Date.now() - T0;
    var el = e.target;
    var onForm = isFormControl(el);
    var fname = onForm ? (el.name || el.id || el.type || 'field') : null;
    pushPointerStream({
      at: t,
      type: 'contextmenu',
      field: fname,
      target: targetDesc(el),
      button: e.button,
      pointerType: null,
      trusted: !!e.isTrusted,
      x: e.clientX,
      y: e.clientY
    });
    if (!onForm) { save(); return; }
    var rec = fieldRec(el);
    var recent = [];
    var log = page.pointerDownLog || [];
    var i;
    for (i = 0; i < log.length; i++) {
      if (log[i].field === fname && t - log[i].at <= 500) recent.push(log[i]);
    }
    if (rec.contextMenus.length < 40) {
      rec.contextMenus.push({
        at: t,
        trusted: !!e.isTrusted,
        button: e.button,
        recentPointerDowns: recent
      });
    }
    if (rec.pointerStream.length < 120) {
      rec.pointerStream.push({ at: t, type: 'contextmenu', button: e.button, trusted: !!e.isTrusted });
    }
    save();
  }, true);
  function recordPointerDown(e) {
    var el = e.target;
    var onForm = isFormControl(el);
    var t = Date.now() - T0;
    var fname = onForm ? (el.name || el.id || el.type || 'field') : null;
    var ptr = {
      at: t,
      type: 'pointerdown',
      field: fname,
      target: targetDesc(el),
      button: e.button,
      pointerType: e.pointerType || null,
      pointerId: e.pointerId,
      trusted: !!e.isTrusted,
      x: e.clientX,
      y: e.clientY
    };
    pushPointerStream(ptr);
    if (!onForm) { save(); return; }
    var rec = fieldRec(el);
    rec.pointerDownCount = (rec.pointerDownCount || 0) + 1;
    var logPtr = {
      at: t,
      field: fname,
      button: e.button,
      pointerType: e.pointerType || null,
      pointerId: e.pointerId,
      trusted: !!e.isTrusted
    };
    if (page.pointerDownLog.length < 120) page.pointerDownLog.push(logPtr);
    if (e.button === 2) {
      if (rec.pointerDownRight.length < 40) rec.pointerDownRight.push(logPtr);
    }
    if (rec.openPointerDowns.length < 20) rec.openPointerDowns.push(logPtr);
    if (rec.pointerStream.length < 120) rec.pointerStream.push(ptr);
    save();
  }
  function recordPointerUp(e) {
    var el = e.target;
    var onForm = isFormControl(el);
    var t = Date.now() - T0;
    var fname = onForm ? (el.name || el.id || el.type || 'field') : null;
    var upEntry = {
      at: t,
      type: 'pointerup',
      field: fname,
      target: targetDesc(el),
      button: e.button,
      pointerType: e.pointerType || null,
      pointerId: e.pointerId,
      trusted: !!e.isTrusted,
      x: e.clientX,
      y: e.clientY
    };
    pushPointerStream(upEntry);
    if (!onForm) { save(); return; }
    var rec = fieldRec(el);
    if (rec.pointerStream.length < 120) rec.pointerStream.push(upEntry);
    var open = rec.openPointerDowns || [];
    var matchIdx = -1;
    var i;
    for (i = open.length - 1; i >= 0; i--) {
      if (open[i].pointerId === e.pointerId || (open[i].button === e.button && open[i].pointerId == null)) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx < 0 && open.length) matchIdx = open.length - 1;
    if (matchIdx < 0) { save(); return; }
    var down = open.splice(matchIdx, 1)[0];
    if (rec.pointerHolds.length < 80) {
      rec.pointerHolds.push({
        downAt: down.at,
        upAt: t,
        dwellMs: t - down.at,
        button: down.button,
        pointerType: down.pointerType || e.pointerType || null,
        trusted: !!e.isTrusted
      });
    }
    save();
  }
  addEventListener('pointerdown', recordPointerDown, true);
  addEventListener('pointerup', recordPointerUp, true);
  addEventListener('click', function (e) {
    var t = Date.now() - T0;
    var el = e.target;
    var onForm = isFormControl(el);
    var fname = onForm ? (el.name || el.id || el.type || 'field') : null;
    var entry = {
      at: t,
      type: 'click',
      field: fname,
      target: targetDesc(el),
      button: e.button,
      pointerType: null,
      trusted: !!e.isTrusted,
      x: e.clientX,
      y: e.clientY
    };
    pushPointerStream(entry);
    if (onForm) {
      var rec = fieldRec(el);
      if (rec.pointerStream.length < 120) rec.pointerStream.push(entry);
    }
    save();
  }, true);
  addEventListener('keydown', function (e) {
    if (!isFormControl(e.target)) return;
    var rec = fieldRec(e.target);
    var t = Date.now() - T0;
    rec.keydowns++;
    var offset = rec.lastPasteAt == null ? null : (t - rec.lastPasteAt);
    if (rec.keydownOffsetsFromPaste.length < 200) {
      rec.keydownOffsetsFromPaste.push(offset);
    }
    if (offset != null && offset >= 0 && offset <= PASTE_ATTR_WINDOW_MS) {
      rec.keydownsAttributed++;
    } else {
      rec.keydownsUnattributed++;
    }
    save();
  }, true);
  addEventListener('paste', function (e) {
    if (!isFormControl(e.target)) return;
    var el = e.target;
    var rec = fieldRec(el);
    var t = Date.now() - T0;
    rec.pastes++;
    rec.pasteObserved = true;
    rec.lastPasteAt = t;
    var clip = clipText(e);
    var detail = {
      at: t,
      clipboard: clip,
      clipboardLen: clip == null ? null : clip.length,
      valueBefore: '',
      valueAfter: null,
      exactMatch: null,
      digitsMatch: null,
      defaultPrevented: !!e.defaultPrevented,
      contextMenuBefore: false,
      pointerRightBefore: false,
      contextMenuOffsetMs: null,
      pointerRightOffsetMs: null,
      disqualified: false,
      disqualifyReasons: []
    };
    try { detail.valueBefore = String(el.value || ''); } catch (err) {}
    var fname = el.name || el.id || el.type || 'field';
    attachGestureAnalysis(rec, detail, t, fname);
    if (rec.pasteDetails.length < 20) rec.pasteDetails.push(detail);
    /* Masks/controlled often rewrite async after paste; sample twice.
     * Typing-sim may still be rewriting at 50ms — also sample late. */
    setTimeout(function () { recordPasteOutcome(el, rec, detail, 0); }, 0);
    setTimeout(function () { recordPasteOutcome(el, rec, detail, 1); }, 50);
    setTimeout(function () { recordPasteOutcome(el, rec, detail, 2); }, 200);
    save();
  }, true);
  addEventListener('input', function (e) {
    if (!isFormControl(e.target)) return;
    var el = e.target;
    var rec = fieldRec(el);
    var t = Date.now() - T0;
    rec.events++;
    if (rec.firstAt === null) rec.firstAt = t;
    if (rec._prev !== null && rec.gaps.length < 200) rec.gaps.push(t - rec._prev);
    rec._prev = t;
    rec.lastAt = t;
    try { rec.finalLength = String(el.value || '').length; } catch (err) {}
    save();
  }, true);

  addEventListener('visibilitychange', function () { page.dwellMs = Date.now() - T0; save(); });
  addEventListener('pagehide', function () { page.dwellMs = Date.now() - T0; save(); });
  addEventListener('beforeunload', function () { page.dwellMs = Date.now() - T0; save(); });
  setInterval(function () { page.dwellMs = Date.now() - T0; save(); }, 2000);

  /* ---------- Layer D beacon (optional) ----------
   * Config: window.__AGENTAPT_BEACON__ = { siteKey, endpoint }
   * Payload: schemaVersion, counters, verdict — never clipboard / field values. */

  function beaconConfig() {
    try {
      var c = window.__AGENTAPT_BEACON__;
      if (!c || typeof c !== 'object') return null;
      if (!c.siteKey || !c.endpoint) return null;
      return { siteKey: String(c.siteKey), endpoint: String(c.endpoint) };
    } catch (e) {
      return null;
    }
  }
  function newIdempotencyKey() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function sharedFieldsWithContent() {
    var n = 0;
    var i;
    for (i = 0; i < LAYER_D_SHARED.length; i++) {
      var f = page.fields[LAYER_D_SHARED[i]];
      if (f && (f.finalLength || 0) > 0) n++;
    }
    return n;
  }
  function beaconReady(force) {
    var ld = page.layerD;
    if (!ld) return false;
    if (force) return true;
    if (page.beaconSentAt) return false;
    if (ld.fillFirstFocusAt == null) return false;
    if (ld.fillLastPasteAt != null) return true;
    return sharedFieldsWithContent() >= 4;
  }
  function buildDisqualifyReasons(ld) {
    var reasons = [];
    if ((ld.contextMenuCountInFill || 0) > 0) reasons.push('contextmenu');
    if ((ld.pointerRightCountInFill || 0) > 0) reasons.push('pointer-right');
    if ((ld.longTouchHoldsInFill || []).length > 0) reasons.push('long-touch-hold');
    return reasons;
  }
  function readWebdriver() {
    try {
      if (S.env && (S.env.webdriver === true || S.env.webdriver === false)) return S.env.webdriver;
    } catch (e) {}
    try {
      return navigator.webdriver === true;
    } catch (e2) {
      return null;
    }
  }
  function buildBeaconPayload(cfg) {
    var ld = page.layerD;
    if (!ld) return null;
    if (!page.beaconIdempotencyKey) page.beaconIdempotencyKey = newIdempotencyKey();
    return {
      schemaVersion: '1',
      provenance: 'layer-d-behavioural',
      idempotencyKey: page.beaconIdempotencyKey,
      merchantId: cfg.siteKey,
      occurredAt: new Date().toISOString(),
      page: {
        origin: location.origin,
        path: PAGE
      },
      webdriver: readWebdriver(),
      layerD: {
        pasteFields: ld.pasteFields || 0,
        unattributedKeydowns: ld.unattributedKeydowns || 0,
        necessaryPass: !!ld.necessaryPass,
        sessionDisqualified: !!ld.sessionDisqualified,
        disqualifyReasons: buildDisqualifyReasons(ld),
        contextMenuCountInFill: ld.contextMenuCountInFill || 0,
        pointerRightCountInFill: ld.pointerRightCountInFill || 0,
        longTouchHoldCount: (ld.longTouchHoldsInFill || []).length,
        verdict: ld.verdict || 'inconclusive'
      }
    };
  }
  function maybeSendBeaconEvent(force) {
    var cfg = beaconConfig();
    if (!cfg) return;
    if (!beaconReady(force)) return;
    if (page.beaconSentAt && !force) return;
    /* Force after already-sent: still same idempotency key → Worker replay. */
    var payload = buildBeaconPayload(cfg);
    if (!payload) return;
    page.beaconSentAt = Date.now() - T0;
    saveQuiet();
    var body = JSON.stringify(payload);
    try {
      fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body,
        keepalive: true,
        mode: 'cors',
        credentials: 'omit'
      }).then(function (res) {
        return res.json().then(function (j) {
          page.beaconLastStatus = res.status;
          page.beaconLastResponse = j;
          if (!res.ok) page.beaconLastError = (j && j.error) || ('HTTP ' + res.status);
          saveQuiet();
        });
      }).catch(function (err) {
        page.beaconLastError = String(err && err.message ? err.message : err);
        saveQuiet();
      });
    } catch (e) {
      page.beaconLastError = String(e && e.message ? e.message : e);
    }
  }
  function saveQuiet() {
    /* Persist beacon status without re-entering maybeSendBeaconEvent. */
    try { recomputeLayerD(); } catch (e) {}
    var raw = JSON.stringify(S);
    try { sessionStorage.setItem(KEY, raw); } catch (e) {}
    try { localStorage.setItem(KEY, raw); } catch (e) {}
  }

  /* ---------- retrieval ----------
   * No visible UI on purpose.
   *
   * Phase 0: keep localStorage backup on hide/close, but do NOT auto-download.
   * Auto-download on visibility/pagehide spammed Downloads on every refresh
   * and confused sessions. Manual: Ctrl+Shift+D or __probeSave().
   * After agent closes tab: reopen page and __probeRecover(). */

  window.__probeDump = function () {
    try {
      var fromSession = JSON.parse(sessionStorage.getItem(KEY));
      if (fromSession) return fromSession;
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  };
  window.__probeSave = function (reason) {
    try { page.dwellMs = Date.now() - T0; } catch (e) {}
    save();
    try { maybeSendBeaconEvent(true); } catch (e) {}
    var data = window.__probeDump();
    if (!data) return;
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var tag = reason ? String(reason).replace(/[^a-z0-9_-]+/gi, '').slice(0, 24) : 'manual';
    a.download = 'probe-' + tag + '-' + Date.now() + '.json';
    a.click();
    try { URL.revokeObjectURL(a.href); } catch (e) {}
  };
  window.__probeBeacon = function () {
    try { recomputeLayerD(); } catch (e) {}
    maybeSendBeaconEvent(true);
    return {
      config: beaconConfig(),
      sentAt: page.beaconSentAt,
      idempotencyKey: page.beaconIdempotencyKey,
      lastStatus: page.beaconLastStatus || null,
      lastResponse: page.beaconLastResponse || null,
      lastError: page.beaconLastError || null,
      layerD: page.layerD
    };
  };
  window.__probeReset = function () {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    try { localStorage.removeItem(KEY); } catch (e) {}
    try { localStorage.removeItem('agentapt_probe_v1'); } catch (e) {}
    location.reload();
  };
  window.__probeRecover = function () {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!data) {
      try { data = JSON.parse(localStorage.getItem('agentapt_probe_v1')); } catch (e) {}
    }
    if (!data) { console.warn('No probe backup in localStorage'); return null; }
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    window.__probeSave('recover');
    return data;
  };

  addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) window.__probeSave('hotkey');
  });

  /* Backup only — no download. */
  addEventListener('pagehide', function () { try { page.dwellMs = Date.now() - T0; save(); } catch (e) {} });
  addEventListener('beforeunload', function () { try { page.dwellMs = Date.now() - T0; save(); } catch (e) {} });
  addEventListener('visibilitychange', function () {
    try { page.dwellMs = Date.now() - T0; save(); } catch (e) {}
  });
})();
