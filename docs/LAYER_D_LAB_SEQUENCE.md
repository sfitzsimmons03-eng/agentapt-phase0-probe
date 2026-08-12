# Layer D — Lab sequence (form-fill signature)

**Status:** Lab open for Arm E (mixed-method human); session-level disqualifier in probe v11. Collector still parked.  
**Harness:** [agentapt-phase0-probe](https://github.com/sfitzsimmons03-eng/agentapt-phase0-probe) · live `https://probe.agentapt.tech`  
**Probe:** `probe.js` v11+ (paste survival + paste-aware keydown attribution + context-menu disqualifier + session-level `layerD` verdict)  
**Date:** 2026-08-12  
**Scope:** Behavioural fill detection only (Layer D). Layers A/B/C out of scope here.

This document is the evidence base for a detection-layer ticket. Write the ticket against these numbers and bounds — not against a re-tuned threshold.

---

## 1. Rule as it stands

**Primary signal:** paste observed on form fields.

**Accounting (not a raw keydown total):**

- On each field, record `lastPasteAt` and every keydown’s offset from that paste.
- Keydowns with offset in `[0, 500ms]` after paste → **attributed** (mask / typing-sim aftermath).
- All other keydowns → **unattributed** (including keydowns *before* paste, e.g. ⌘V).

**Decision (draft, for ticket):**

```
NECESSARY (not sufficient):
  paste_fields >= 4 of 5 shared checkout fields
  AND
  sum(keydownsUnattributed) across those fields <= 3

DISQUALIFIER (structural, SESSION-LEVEL):
  if contextmenu OR pointerdown(button===2) landed on ANY field
  within PASTE_CONTEXT_LOOKBACK_MS (2000) before that field's paste
  → the WHOLE SESSION is disqualified as agent evidence
  (one hit is enough; field-level flags are retained for diagnostics)

VERDICT:
  necessary fails                         → not agent
  necessary passes + session disqualified → not agent (human context-menu class)
  necessary passes + silence              → INCONCLUSIVE
                                            (do NOT claim agent-detected)
```

Verdict shape (verbatim): **necessary pass + disqualifier → not-agent; necessary pass + silence → INCONCLUSIVE.**

Absence of a disqualifier draws **no positive conclusion**. Corroborators may upgrade a verdict later; their absence must never assert one. Product rule: a false positive that tells a merchant “an AI agent filled your checkout” when it was a person (especially iPhone) is a hard line we do not cross. Error direction we accept: under-report agent traffic rather than invent agent traffic.

**Why session-level (not field-level):** a human who right-clicks one field and ⌘V-pastes the other four would leave 4 fields clearing paste≥4 with no per-field disqualifier. Field-level would still look agentish. Session-level: any one disqualified field fails the session. Cost: if a future agent pastes via synthetic right-click, we go blind to that whole class, not one field. Accept deliberately — re-check **zero contextmenu on every new agent** added to the matrix (today: 2 Comet arms at zero; not settled forever).

**Evasion caveat (not a blocker):** session-level is trivially evadable — an agent could dispatch a synthetic `contextmenu` and disqualify itself. Acceptable now: today's agents aren't hiding; if they were, the paste-signature approach collapses anyway. Error lands on "not agent" / inconclusive — the direction we want.

Shared fields on Harbour Lane: `name`, `email`, `address`, `city`, `postcode`.

Phone is **instrumented but out of necessary-condition scope**. It **does** count toward session disqualification if it trips contextmenu/right-click (any field).

**Measured vs precautionary (read before building on this rule):**

Both tolerances in the decision block are **insurance**, not lab-validated slack. The data supports a sharper rule; the caps are kept for margin.

| Parameter | What the arms show | What the rule says | Status |
|-----------|-------------------|-------------------|--------|
| Unattributed keydowns | Every Comet arm **exactly 0**. Nearest *keydown* negative: autofill at **5**. Human context-menu paste also lands at **0** — so `<= 3` does **not** separate that class at all. Zero against zero. | `<= 3` | **Precautionary for keydown classes; useless against context-menu paste.** Leftover from the raw-total era. If a future run lands at 1 or 2, treat it as a surprise worth investigating. |
| Paste field count | Every arm is **5/5 or 0/5**. Nothing has produced 3 or 4. | `>= 4 of 5` | **Untested tolerance** — insurance against a partial-paste case we have never observed. Fine to keep; do not read it as validated partial-paste behaviour. |
| Paste-attribution window | Typing-sim attributed fully to zero unattributed keydowns. We did **not** measure the full offset distribution or the observed maximum across all attributed keydowns. | `[0, 500ms]` | **Precautionary, partially measured** — we know 500ms was sufficient for the typing-sim arm, not that it is tight. Record observed maxima on future runs before treating this as a calibrated boundary. |
| Context-menu lookback | Human v10: disqualified offsets 1199–1786 ms; one field miss at **2010 ms**. Under session-level, that miss costs nothing if any other field hits. | `PASTE_CONTEXT_LOOKBACK_MS = 2000` | **Named constant; no longer decision-critical.** Do **not** retune against the 2010ms sample. Leave at 2000. |

**Why this shape (not “raise the keydown cap”, and not “move primary onto fill span”):**

- A masked ZIP that rebuilds paste char-by-char manufactures keydowns *after* paste. Raising `≤3` → `≤12` fixes one mask and dies on the next. Attribution measures the mask, not the agent.
- Keyboard clipboard fill (⌘V / Maccy) manufactures keydowns *before* paste. Those cannot attribute to a paste that has not fired yet. Same instrumentation separates that class for free.
- Comet has no keyboard involvement: paste without preceding shortcut keydowns → unattributed ≈ 0.
- Human context-menu paste (right-click → Paste) also lands paste 5/5 / unattr 0. Fill span is continuous and fragile. **Do not move the primary gate onto fill span.** Keep paste+unattr as necessary conditions; add a **structural session-level disqualifier** (contextmenu / button===2 before paste). Absence → INCONCLUSIVE, never agent-detected.

**Corroboration only (never primary, never asserts alone):** fill span ~1.1–1.4s and ~5 INPUT clicks on Comet. Timing alone is fragile. Pointer-hold traces (`pointerHolds` dwellMs) are captured raw for a possible iOS long-press separator later — **no consumer yet; do not invent a rule from them.**

**Paste survival instrumentation (kept):** per-field `pasteObserved`, clipboard vs landed `exactMatch` / `digitsMatch` (sample after mask rewrite). Masks that format (phone) correctly show exactMatch false + digitsMatch true.

**Context-menu / pointer capture (v10/v11):** per field — `contextMenus[]`, `pointerDownRight[]` (button===2), `pointerHolds[]` (down/up dwellMs). On each paste, flag field `pasteDisqualified` if menu/right-button landed within lookback. Page `layerD` rolls that up to **sessionDisqualified** / `verdict`.

**Pointer-capture health check (answered before trusting iOS):** on the macOS human context-menu arm, `pointerHolds` were populated (~83–116 ms) while `pointerDownRight` stayed 0. Capture is alive; macOS Chrome simply does not set `button===2` on that path — `contextmenu` covers it. iOS arm then showed long touch dwells ~842–1079 ms. Not "empty because dead instrumentation."

---

## 2. Arms that clear the rule (Comet = agentish)

Same agent (Perplexity Comet), same values where applicable. One variable changed per arm.

| Arm | Page | paste | raw kd | unattr | fill span | Rule |
|-----|------|------:|-------:|-------:|----------:|:----:|
| **Plain** | `/checkout.html` | 5/5 | 0 | **0** | 1282 ms | pass |
| **Controlled + mask** | `/checkout-controlled.html` | 5/5 | 0 | **0** | 1121 ms | pass |
| **Typing-sim mask** | `/checkout-typing-sim.html` | 5/5 | 5 (ZIP) + 11 (phone) | **0** | 1430 ms | pass |

### Raw detail — plain (2026-08-09)

Per field: events / keydowns / pastes — all `1 / 0 / 1`.  
`pasteObserved` true, `exactMatch` true on all five. INPUT clicks: 5.

### Raw detail — controlled + mask (2026-08-09)

Shared five: same `1 / 0 / 1`, paste survived ZIP and phone.  
Phone: exactMatch false → `(503) 555-0199`, digitsMatch true. ZIP exactMatch true. Keydowns not manufactured.

### Raw detail — typing-sim (2026-08-10)

| Field | paste | raw kd | unattr | notes |
|-------|------:|-------:|-------:|-------|
| name, email, address, city | 1 each | 0 | 0 | plain paste |
| postcode | 1 | **5** | **0** | all attributed (offsets within window) |
| phone | 1 | **11** | **0** | attributed; digitsMatch true |

Paste held 5/5. Mask manufactured keydowns; accounting zeroed them. **Primary signal intact; raw total was the broken part.**

Intermittent Comet plain with postcode `keydown=1` + paste: reconstructs to unattr 0 under paste-aware accounting (same window). This arm was captured **before** `keydownOffsetsFromPaste` existed, so attribution here is inferred from the earlier timestamps/events, not measured directly.

---

## 3. Negative arms (must not fire as agent)

| Arm | paste | raw kd | unattr | fill span | Necessary | Notes |
|-----|------:|-------:|-------:|----------:|:---------:|-------|
| Manual typing | 0/5 | 49 | **49** | ~6670 ms | fail | — |
| Chrome autofill | 0/5 | 5 | **5** | ~1 ms | fail | — |
| Bitwarden (inject) | 0/5 | ~16 | **~16** | ~273 ms | fail | — |
| Maccy / ⌘V clipboard | 5/5 | 11 | **11** | ~5674 ms | fail | pre-paste shortcut keydowns |
| Human right-click → Paste (2026-08-12) | **5/5** | **0** | **0** | **~11687 ms** | **pass** | necessary conditions do not separate; disqualifier pending v10 re-run |

### Maccy mechanism (2026-08-10)

Paste 5/5, exactMatch true. Per-field keydown offsets were `null` (keydown before `lastPasteAt`). Typical ⌘V: Meta/V fire, then `paste`. Unattributed 11 → necessary conditions fail.

Structural, not tuned: Comet never fires those shortcut keydowns.

### Human context-menu paste (2026-08-12, pre-disqualifier capture)

Desktop right-click → Paste on plain checkout:

- paste 5/5, unattributed 0, raw keydowns 0
- fill span ~11.7s

**Necessary conditions pass.** That is a gate problem, not noise. We do **not** fix it by promoting fill span to primary (continuous, one human sample, will overlap under slow agents / heavier pages). Fix is a **structural disqualifier**: `contextmenu` / `pointerdown(button===2)` in the lookback before paste on the same field. Until that capture is confirmed on a re-run, paste+unattr alone must read **INCONCLUSIVE**, not agent-detected.

Android long-press is expected to fire `contextmenu` (disqualifier should catch it). iOS Safari / Chrome-on-iOS does **not** fire `contextmenu` on long-press (WebKit). That class stays open; `pointerHolds` raw capture exists for a later look — no rule yet.

---

## 4. Known evasion / residual classes

State explicitly. Do not pretend the rule covers them.

### 4a. False positive — programmatic-paste PWM / extension

**Shape:** injects field values via a synthetic `paste` (or paste-like path) with **no** preceding keystrokes.

**Why it matches:** same primary signature as Comet — paste ≥4, unattributed keydowns ≈ 0.

**What we tested that is *not* this class:** Bitwarden inject (paste=0), Maccy keyboard-clipboard (pre-paste keydowns).

**Bound:** extension-based or API managers that synthesize paste without keyboard. Known, bounded. Do not chase before collector; ticket should list as accepted FP class or as a follow-up arm.

### 4b. False positive — human context-menu paste (desktop)

**Shape:** person clicks into each field and pastes via context menu (right-click → Paste). Fires `paste` with no keyboard shortcut.

**Why necessary conditions match:** measured 2026-08-12 — paste 5/5, unattr 0. Zero against zero with Comet on the keydown gate.

**Mitigation (in progress, v10):** structural disqualifier — `contextmenu` or `pointerdown(button===2)` within `PASTE_CONTEXT_LOOKBACK_MS` before paste on the same field → field disqualified as agent evidence. Absence of disqualifier ⇒ INCONCLUSIVE, not agent.

**What we tested that is *not* this class:** Maccy / ⌘V keyboard clipboard (fails necessary conditions via pre-paste keydowns).

**Still open:** iOS long-press paste (no `contextmenu` in WebKit). Capture `pointerHolds` raw; do not write a hold-duration rule until a real iPhone trace exists. Android long-press expected to fire `contextmenu` — confirm when Fitz runs it.

### 4c. False negative — agent that types instead of pastes

**Shape:** agent fills by synthesizing keydown/input per character (or real typing automation) with **paste=0**.

**Why it misses:** rule requires paste on ≥4 fields. Looks like manual or Bitwarden-ish keydown noise, not Comet.

**Bound:** any agent (or future Comet mode) that abandons clipboard paste for typing. Out of scope for this Layer D primary; would need a different signal (timing/jitter, click pattern, or declared Layer A).

### 4d. Out of scope but related

- **Shopify web pixel:** no `document` → cannot run Layer D at all. Theme app embed (or equivalent page script) is the install path. Desk research; not an arm.
- **Layers A/B/C:** UA grep / Atlas favicon / Comet DOM inject — separate verdicts; not part of this sequence.
- **Windows arms (Fitz):** Ctrl+V, context-menu key, Win+V clipboard history — zero data; same v10 capture covers them. Do not run device arms until capture ships.

---

## 5. Lab sequence (what was run, in order)

1. Plain checkout — Comet baseline (paste + near-zero keydown).
2. Controlled React + rewrite masks — paste survival; keydown threshold not defended.
3. Typing-sim mask (paste → char-by-char synthetic keydowns) — false-negative risk for raw totals.
4. Paste-aware instrumentation + back-test on existing arms (Comet ×3, manual, autofill, Bitwarden).
5. Keyboard clipboard-fill (Maccy) — pre-paste keydown lookalike; cleared under paste-aware rule.
6. Human context-menu paste (desktop right-click) — necessary conditions pass (5/5, unattr 0); fill span ~11.7s. Gate problem confirmed.
7. **v10 capture shipped** (`efdcfdf`): contextmenu / button===2 lookback + raw pointerHolds.
8. Re-run human context-menu (expect disqualifier) + Comet plain + Comet controlled (expect zero disqualifier) — **done 2026-08-12**.

### v10 arm results (2026-08-12)

| Arm | paste | unattr | disqualified fields | contextmenu | button===2 | fill span | Verdict |
|-----|------:|-------:|--------------------:|:-----------:|:----------:|----------:|---------|
| Human right-click → Paste | 5/5 | 0 | **4/5** (`contextmenu`) | yes (1/field) | **0** | ~10074 ms | **not-agent (disqualifier)** |
| Comet plain | 5/5 | 0 | **0/5** | **0** | **0** | 1208 ms | INCONCLUSIVE (necessary pass, no disq) |
| Comet controlled | 5/5 | 0 | **0/5** | **0** | **0** | 1127 ms | INCONCLUSIVE (necessary pass, no disq) |

**Disqualifier works and does not trip Comet.** Gate is not worse.

**Human detail:** `contextmenu` alone carried the disqualifier (macOS Chrome: `pointerDownRight` stayed empty; `pointerHolds` populated ~83–116 ms — capture healthy). Offsets menu→paste: name 1199, address 1785, city 1786, postcode 1532 ms. **Email miss at 2010 ms** — under **session-level** disqualification this miss is irrelevant (4 other hits). Do not retune lookback.

Under session-level rule this arm is **not-agent** (sessionDisqualified=true).

**Comet pointerHolds:** dwell ~0–2 ms (focus clicks). Human holds on context-menu arm ~83–116 ms. Raw only; no hold rule.

**Pointer health (Claude item 4):** answered from the macOS human arm — holds present, only `button===2` empty. Safe to trust iOS pointer traces.

**Arm E (pending):** mixed-method human — context-menu paste on **one** field, ⌘V on the other four. Tests session-level: expect exactly 1 field disqualified, session not-agent; also records whether 4×⌘V unattr stays ≤3 (if yes, disqualifier is the only thing stopping an agent verdict).

**Not run / deferred:** Arm E mixed-method, programmatic-paste extension PWM (4a), Android / Windows (Fitz), Kitesurf (§8), collector / `beacon.js` (testers first).

### iOS long-press paste (2026-08-12, Safari iPhone)

UA: iPhone OS 18_7 / AppleWebKit — plain `/checkout.html`.

| Signal | Result |
|--------|--------|
| paste | **5/5** |
| unattr keydowns | **0** |
| contextmenu | **0** (WebKit — as expected) |
| pointerDownRight (button===2) | **0** |
| pasteDisqualified | **0/5** |
| fill span | ~14203 ms |
| Verdict under current rule | **INCONCLUSIVE** (necessary pass, no disqualifier) |

**Raw `pointerHolds` (the reason item 3 exists):** every shared field shows **two** touch holds — a short tap (~74–180 ms) then a long press (~842–1079 ms, median long ~925–938). Long-press `pointerup` ends ~940–1045 ms before the paste. `pointerType: touch`, `button: 0`, `trusted: true`.

Compare Comet v10 holds on the same fields: dwell **~0–2 ms** (focus clicks only).

**Read:** desktop/Android-style contextmenu disqualifier does **not** catch iOS. The long-touch dwell before paste is a real, measurable separator in this one sample — still a **hypothesis for a future rule**, not a shipped gate. Do not promote hold-duration to primary without more traces (and confirm it does not false-positive on slow human taps).

Note: clipboard values in this run were the probe version-check snippet pasted into every field — fine for event signature, ignore content.

---

## 6. Probe pages

| URL | Arm |
|-----|-----|
| https://probe.agentapt.tech/checkout.html | Plain inputs |
| https://probe.agentapt.tech/checkout-controlled.html | React controlled + ZIP/phone rewrite |
| https://probe.agentapt.tech/checkout-typing-sim.html | Paste → synthetic per-char keydowns |

Retrieval: `__probeSave('tag')` / `__probeReset()` before clean arms. Prefer fresh session; sessionStorage accumulates historical pages. Confirm `probe.js?v=11` before Arm E.

---

## 7. Ticket-ready summary

**Ship Layer D as page-tag behavioural fill detection** with:

1. Paste presence on ≥4 of 5 address fields as a **necessary** condition (not sufficient).
2. Unattributed keydown sum (paste-window attribution, 500ms) as a **necessary** keydown gate — not raw totals.
3. Structural **session-level disqualifier**: contextmenu / pointerdown(button===2) within lookback before paste on **any** field → whole session not-agent.
4. Necessary pass + silence → **INCONCLUSIVE** (never assert agent-detected).
5. Re-check zero-contextmenu assumption against every new agent in the matrix.
6. Documented FP residual: programmatic paste with no keystrokes; iOS long-press (hold hypothesis open, not a shipped rule).
7. Documented FN: agents that type instead of paste; agents that synthesize contextmenu (self-disqualify — accepted error direction).
8. Install: theme embed / page script only — not a Shopify web pixel.

**Do not:** raise raw keydown caps to swallow masks; move primary onto fill span; retune 2000ms lookback against one sample; treat Maccy/⌘V as the residual FP (it fails necessary conditions); read phone into the necessary shared-five sum; claim agent from paste+unattr alone; start collector before this contract is accepted.

**Tolerances (§1):** `>= 4 of 5` and `<= 3` unattributed are precautionary for keydown classes. Context-menu human paste lands at 0 unattr — the tolerance does not separate that class. Lookback is no longer decision-critical under session-level. See §1 table.

---

## 8. Watch list (not queued)

Items to track so they do not surprise us after the collector is built. **Do not reprioritise** lab or collector work for these.

### Cloudflare Kitesurf (2026)

**What:** Cloudflare’s cloud browser for AI agents, running on Workers. Not Chromium — custom stack (Blitz rendering, Stylo CSS, Boa JS), explicitly not focused on visual fidelity. Available now in free beta behind per-account limits, with a public playground and CDP / Quick Action access.  
**Ref:** https://blog.cloudflare.com/kitesurf/

**Why Layer D cares:** The paste-vs-type signature was calibrated entirely on **Comet (Chromium)**. Kitesurf may behave differently — paste like Comet, set `.value` directly with no observable events, or skip `paste` entirely. If the last case, that is a **false negative** on a browser built for exactly the traffic we are measuring.

**Timing:** Browser Run is reachable now. This is no longer blocked on availability; only on priority.

**Free half (no account / no new harness):**

- what UA hits `/probe-log`
- robots.txt behaviour
- engine fingerprint: globals, `navigator.webdriver`, speech-synthesis voices, WebGL / media gaps

This can be done in the public playground and is useful even without agentic fill because absence of capability is cleaner than an anomalous value.

**Paid / account half (CDP endpoint):** one probe arm — same Harbour Lane checkout pages and instrumentation as Comet (plain → controlled → typing-sim as needed). No new harness code; Playwright/CDP connection change only.

**Also capture on that arm (Layer A):**

- What UA does it send when the caller sets nothing?
- Can the caller override the UA entirely?
- Does it respect `robots.txt`?

If UA is fully overridable, declaration is weak for this whole class. That answer matters more than whether the default string happens to self-identify. Would also be the first real declared-agent sample on non-OpenAI infrastructure; we still have no OpenAI-cloud Comet data (local Playwright only for one arm historically).

**Status:** Watch list only. Layer D closed on rule shape; collector parked until sequencing allows.
