# Layer D — Lab sequence (form-fill signature)

**Status:** Layer D **closed**. **§7 accepted 2026-08-17** — collector unblocked against these bounds. Beacon pipe **proven** (scanner route + Render forwarder). No Phase 0 kill-gate ticket remaining (Atlas sunset; Comet DOM struck on hosted retest).  
**Harness:** [agentapt-phase0-probe](https://github.com/sfitzsimmons03-eng/agentapt-phase0-probe) · live `https://probe.agentapt.tech`  
**Probe:** `probe.js` **v18** — Layer D verdict + same-origin `POST /api/beacon`. Optional `webdriver` + optional `env` fingerprint on beacon payload (diagnostic only). `source_class` server-side only.  
**Date:** 2026-08-17  

**iPhone — CLOSED, do not re-ask:** Antonello has an iPhone. **iOS long-press paste arm completed 2026-08-12** (Safari, plain checkout). Capture file: `ios_long_paste.json`. Result: paste 5/5, unattr 0, no `contextmenu`, verdict INCONCLUSIVE under **current** rule; `pointerHolds` long dwell ~842–1079 ms recorded raw. Proposed fix: gesture disqualifier (§4b′). No further iPhone availability question unless a *new* iOS arm is spec'd.

**Scope:** Behavioural fill detection only (Layer D). Layers A/B/C out of scope here.

**Process note:** future arms must state the exact measurement interval they perturb and confirm the run actually perturbs it before execution. Arms E and F were both derivable from §7 before being written; F validated the windowless path Claude now adopts.

**Back-test first:** any future rule change is tested against **stored captures** before a new arm is run. That is what made the iOS/Comet gesture check cheap (iOS 5/5 disqualified, Comet 0/5, no new sessions). New arms only after the stored set cannot answer the question.

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

DISQUALIFIER (structural, UNIFIED GESTURE, v15 shipped):
  if ANY of the following on a form control in the fill:
    - contextmenu OR pointerdown(button===2) between first
      field focus and last paste (windowless fill span)
    - trusted pointerType=touch hold dwell ≥ 400ms with
      pointerup within 2000ms before that field's paste
  → the WHOLE SESSION is not-agent
  Per-field 2000ms contextmenu lookback is DIAGNOSTIC ONLY.
  Contextmenu-only windowless kept as sessionDisqualifiedContextMenuOnly.

VERDICT:
  necessary fails                         → not agent
  necessary passes + session disqualified → not agent (human context-menu class)
  necessary passes + silence              → INCONCLUSIVE
                                            (do NOT claim agent-detected)
```

Verdict shape (verbatim): **necessary pass + disqualifier → not-agent; necessary pass + silence → INCONCLUSIVE.**

**Conceptual reframe (2026-08-14):** paste-without-keystrokes is not an agent signature — it is a **“didn't type it”** signature. Humans do that constantly (autofill, clipboard, long-press). What separates an agent is the **absence of a preceding human gesture**, not the presence of a paste. Necessary conditions remain as a coarse gate; the disqualifier should unify human gestures (contextmenu, long touch hold, pointer right-click) rather than patching each FP class separately.

Absence of a disqualifier draws **no positive conclusion**. Corroborators may upgrade a verdict later; their absence must never assert one. Product rule: a false positive that tells a merchant “an AI agent filled your checkout” when it was a person (especially iPhone) is a hard line we do not cross. Error direction we accept: under-report agent traffic rather than invent agent traffic.

**Why windowless session-level (corrected after Arm E):** Arm E (1× context-menu + 4× ⌘V) was the wrong danger shape — four ⌘V always produce ~8+ unattributable keydowns, so necessary fails without the disqualifier. The real danger is **all-context-menu, paced slowly**: paste 5/5, unattr 0, indistinguishable from Comet on necessary conditions. Then the disqualifier is the entire separation, and it only works if **at least one** contextmenu is counted. Per-field 2000ms lookback can miss slow gaps (v10 email miss at 2010ms). Session verdict therefore counts any menu/right-click in the fill span (first focus → last paste), with no lookback. Stray right-click in that window errs toward not-agent.

**Still true:** re-check **zero contextmenu on every new agent** in the matrix (today: 2 Comet arms at zero; not settled forever). Cost of session-level: a future agent that pastes via synthetic right-click blinds the whole class.

**Evasion caveat (not a blocker):** trivially evadable via synthetic `contextmenu`. Acceptable now: today's agents aren't hiding; if they were, paste-signature collapses anyway. Error lands on "not agent" / inconclusive.

Shared fields on Harbour Lane: `name`, `email`, `address`, `city`, `postcode`.

Phone is **instrumented but out of necessary-condition scope**. It **does** count toward session disqualification if it fires contextmenu/right-click in the fill window.

**Measured vs precautionary (read before building on this rule):**

| Parameter | What the arms show | What the rule says | Status |
|-----------|-------------------|-------------------|--------|
| Unattributed keydowns | Comet always **0**. Autofill **5**. Human all-context-menu **0**. Arm E mixed ⌘V **10**. | `<= 3` | Precautionary for keydown classes; does not separate all-context-menu humans. |
| Paste field count | Always **5/5 or 0/5** so far. | `>= 4 of 5` | Untested partial-paste tolerance. |
| Paste-attribution window | Typing-sim attributed fully inside 500ms. | `[0, 500ms]` | Precautionary, partially measured. |
| Per-field context lookback | v10 miss at 2010ms; Arm F will stress slow gaps. | `2000ms` | **Diagnostic only — not in session verdict path.** Do not retune. |

**Why this shape (not fill span as primary):** fill span is continuous and fragile. Keep paste+unattr as necessary; structural windowless session disqualifier for context-menu humans; silence → INCONCLUSIVE.

**Corroboration only:** fill span / clicks. Touch-hold is now in the shipped disqualifier (v15), not raw-only.

**Paste survival:** `pasteObserved`, `exactMatch` / `digitsMatch` kept.

**Capture (v15):** page-level `pointerStream`; per-field `pointerStream`; `pasteDetails.pointerStreamWideBeforePaste`; **`layerD.verdict` uses unified gesture disqualifier** (contextmenu / button===2 in fill span **or** trusted touch hold ≥400ms within 2000ms of paste). Diagnostic: `sessionDisqualifiedContextMenuOnly`, `gestureDisqualifiedFields`, `longTouchHoldsInFill`. `gestureVerdict` aliases `verdict`.

### Arm G3 clean re-run — **done 2026-08-14**

**Result:** paste **0/5**, unattr **5**, bulk `input`-only fill ~14 ms, `contextMenuCountInFill=0`, verdict **`not-agent-necessary-fail`**. Common Chrome path is **safe by construction** (like Bitwarden) — no gesture disqualifier needed for this path.

**Chrome version check (both G3 captures):** **Chrome/150.0.0.0** on both original and clean runs — same version, same machine. Version change is **not** the trigger for the two paths.

**Live question:** first G3 (same Chrome) showed paste **5/5**. Two autofill paths exist; **trigger unidentified**, not reproducible on demand as of 14 Aug. Bounded repro attempts (2–3) optional; if not reproduced, log as stated limit — unknown frequency, not a collector blocker.

**Pointer-capture health (CLOSED — do not re-block on this):** macOS human context-menu arm had `pointerHolds` populated (~83–116 ms) while `button===2` stayed 0 → capture alive; macOS Chrome simply does not set button 2 on that path. iOS arm then recorded long touch dwells ~842–1079 ms. Not silent-dead instrumentation.

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

### 4a. Chrome autofill — two observed paths (same browser)

**Do not list Bitwarden and Chrome together.** Same broad category (fill helpers), opposite default mechanics.

#### 4a-i. Common path — input-only (safe by construction)

**Measured (G3 clean, 2026-08-14, v14):** paste **0/5**, unattr **5**, bulk fill ~14 ms, all fields **`input` only**. Verdict **`not-agent-necessary-fail`**. Trusted mouse click on email before fill; Chrome dropdown selection **not visible** in page pointerStream (browser UI outside DOM).

**Read:** default/common Chrome autofill path fails necessary — **no gesture disqualifier needed**.

#### 4a-ii. Observed programmatic-paste path (unreproduced)

**Measured (G3 original, 2026-08-14):** paste **5/5**, unattr **2**, `necessaryPass=true`. Counterfactual without session menu noise: **INCONCLUSIVE** (Comet shape).

**Chrome/150.0.0.0 on both captures** — version is not the differentiator.

**Bound for ticket:** programmatic-paste path **observed once**, trigger **unidentified**, frequency **unknown**, **not reproducible on demand** as of 14 Aug 2026. Stated limit — worse if unpredictable, but not a collector blocker. Plausible triggers to eliminate if repro attempted: autofill surface (address vs payment vs single-field), field type, prior form submission from profile.

### 4a′. Safe by construction — Bitwarden input-only autofill

**Shape:** extension injects via DOM / `input` only — **no `paste` event**.

**Measured (Arm G1b, 2026-08-13):** paste **0/5**, unattr **10**, verdict **`not-agent-necessary-fail`**. Structurally invisible to paste gate. Safe error direction (under-report).

**Do not conflate with §4a.** Input-only is **per-extension / per-path** — Chrome has both input-only (common) and paste (observed once).

### 4a″. Design failure mode — input-only fill (agent or human)

**Shape:** any fill path that sets field values without firing `paste` — DOM inject, `input` events only, direct `.value` assignment.

**Bitwarden extension autofill (Arm G1):** paste **0/5**, unattr **10**, verdict **`not-agent-necessary-fail`**. Values arrived as **`input` with no `paste`** on every shared field. **Safe for humans today** — we under-report, not false-positive.

**The real failure mode:** the necessary condition is **pinned to how current agent browsers happen to fill** (Comet pastes). If Comet or Kitesurf ships **input-only injection**, Layer D returns **`not-agent-necessary-fail` on a real agent** — we go blind without knowing we missed. Atlas is gone (OpenAI sunset 2026-08-09). This is a **false negative**, not a threshold problem; no retuning fixes it. §7 lists it; Comet cadence (below) is the detection plan.

**Contrast with Maccy:** keyboard clipboard fails necessary on keydowns but **does** fire paste — different mechanism, different visibility.

### 4b. False positive — human context-menu paste (desktop)

**Shape:** person clicks into each field and pastes via context menu (right-click → Paste). Fires `paste` with no keyboard shortcut.

**Why necessary conditions match:** measured 2026-08-12 — paste 5/5, unattr 0. Zero against zero with Comet on the keydown gate.

**Mitigation (in progress, v10):** structural disqualifier — `contextmenu` or `pointerdown(button===2)` within `PASTE_CONTEXT_LOOKBACK_MS` before paste on the same field → field disqualified as agent evidence. Absence of disqualifier ⇒ INCONCLUSIVE, not agent.

**What we tested that is *not* this class:** Maccy / ⌘V keyboard clipboard (fails necessary conditions via pre-paste keydowns).

**Still open on desktop:** iOS-style long-press on Android — expected to fire `contextmenu`; confirm when Fitz runs it.

### 4b′. False positive — iOS long-press paste (WebKit)

**Shape:** person long-presses → Paste on each field. Fires **`paste`** with unattr **0**. **No `contextmenu`** in WebKit.

**Measured (2026-08-12, Safari iPhone):** paste **5/5**, unattr **0**, verdict **INCONCLUSIVE** under current rule — **byte-identical necessary shape to Comet plain**. Real human on real iPhone.

**Disqualifier already in capture:** every shared field shows **two** `pointerHolds` — short focus tap (~74–180 ms), then long touch hold **842–1079 ms** (`pointerType: touch`, `trusted: true`) immediately before paste. Four of five long holds cluster **925–938 ms**. Comet fill: **no** comparable holds (mouse focus clicks ~0–2 ms only).

**Proposed extension (SHIPPED v15):** disqualify on **trusted pointer gesture immediately preceding paste** — desktop: `contextmenu` / `pointerdown(button===2)` in fill span; iOS: **trusted touch hold** with dwell ≥ 400 ms within 2000 ms of paste. Structural, not threshold — agent cannot manufacture trusted touch down/up with ~900 ms dwell. Back-tested on stored JSON before shipping (table below). If any Comet arm ever shows trusted long touch hold, abandon approach.

**Back-test on stored JSON (draft rule: touch hold dwell ≥400 ms, gap hold-up → paste ≤2000 ms):**

| Arm | Would touch-hold-disqualify? | Notes |
|-----|:----------------------------:|-------|
| iOS long-press | **5/5** | fixes FP |
| Comet plain v10 | **0/5** | holds ~0–2 ms mouse only — **safe** |
| Comet masked v10 | **0/5** | safe |
| Arm F context-menu | **0/5** | holds ~99–184 ms; already disqualified via `contextmenu` |
| Chrome autofill G3 | **0/5** | short mouse holds only — **not-agent-necessary-fail** on clean path |

**Status:** **shipped v15.** Back-tested on stored arms (iOS 5/5, Comet 0/5). Touch-hold and contextmenu are one mechanism.

### 4c. False negative — agent that types instead of pastes

**Shape:** agent fills by synthesizing keydown/input per character (or real typing automation) with **paste=0**.

**Why it misses:** rule requires paste on ≥4 fields. Looks like manual or Bitwarden-ish keydown noise, not Comet.

**Bound:** any agent (or future Comet mode) that abandons clipboard paste for typing. Out of scope for this Layer D primary; would need a different signal (timing/jitter, click pattern, or declared Layer A).

### 4d. Out of scope but related

- **Shopify web pixel:** no `document` → cannot run Layer D at all. Theme app embed (or equivalent page script) is the install path. Desk research; not an arm.
- **Layers A/B/C:** UA grep / Atlas favicon / Comet DOM inject — separate verdicts; **not part of this sequence.** Phase 0 kill-gate on B/C is **closed** (2026-08): Atlas sunset 9 Aug (OpenAI release notes); Comet hosted retest `resources: []`, no `overlay.js`, `globals.added` only probe helpers. Layer C is not entirely dead: `__codexPlaywrightInjected` remains a real injection artifact — covers **automation-driven** agents, not browser-native Comet.
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

**Arm E (done 2026-08-12):** mixed-method human — context-menu paste on **one** field (`postcode`), ⌘V on the other four.

| Signal | Result |
|--------|--------|
| paste | **5/5** |
| unattributed keydowns | **10** (⌘V fields ~2–3 each; postcode 0) |
| disqualified fields | **1/5** (`postcode` / `contextmenu`, menu→paste 1367 ms) |
| `sessionDisqualified` | **true** |
| `necessaryPass` | **false** (unattr 10 > 3) |
| `layerD.verdict` | `not-agent-necessary-fail` |
| fill span | ~11062 ms |

**Read:** four ⌘V pastes do **not** stay under `unattr <= 3`. Spec error, not probe error: Cmd-V is two pre-paste keydowns ×4 ⇒ necessary always fails. Mixed-method was never the danger zone.

**Danger zone (next):** all-context-menu, paced slowly — unattr 0, paste 5/5, necessary passes; only session disqualifier separates from Comet.

**Arm F first attempt (2026-08-13, incomplete method):** slow paste 5/5, unattr 0, **zero** `contextmenu` — not right-click. Verdict `inconclusive`. Pointer capture healthy. Discarded as a method miss, not a lookback result.

**Arm F confirmed (2026-08-13):** all five fields right-click → Paste, no keyboard, ~4.5–6.0s between pastes.

| Signal | Result |
|--------|--------|
| paste | **5/5** |
| unattributed keydowns | **0** |
| `necessaryPass` | **true** (danger zone vs Comet primary) |
| per-field 2000ms disq | **4/5** (miss: `name` menu→paste **2929 ms**) |
| windowless `sessionDisqualified` | **true** (`contextMenuCountInFill=5`) |
| `layerD.verdict` | **`not-agent-disqualifier`** |
| fill span | ~21943 ms |
| `button===2` | 0 (macOS Chrome; `contextmenu` carries) |
| pointer health | downs=7, holds ~99–184 ms |

**Raw contextmenu / paste ats (page t0):**

| Field | menu at | paste at | gap |
|-------|--------:|---------:|----:|
| email | 2479 | 3891 | **1412** (inside 2000) |
| name | 5500 | 8429 | **2929** (outside) |
| address | 12239 | 14236 | **1997** (3 ms inside) |
| city | 18108 | 19813 | **1705** |
| postcode | 24239 | 25834 | **1595** |

Inter-paste gaps: 4538 / 5807 / 5577 / 6021 ms.

**Read:** necessary conditions match Comet (paste 5/5, unattr 0). **Windowless session rule adopted as the verdict path** (`contextMenuCountInFill=5` → `not-agent-disqualifier`). Per-field 2000ms retired from verdict — diagnostic only. Observed menu→paste gaps span 1412–2929 ms with address at 1997 ms (3 ms inside) and v10 email at 2010 ms (10 ms outside); constant sits in the middle of human distribution, not between populations — do not retune.

**Not run / deferred:** 1Password native autofill (G1 spec, optional), bounded Chrome paste-path repro (2–3 tries max), Android / Windows (Fitz), Kitesurf (§8).

---

## 5b. Arm G — extension-based password-manager fill

**Objective:** does extension / browser native autofill produce agent signature under adopted rule?

Necessary: paste ≥4/5, unattr ≤3. Disqualifier: zero `contextmenu` / button===2 in fill span.

| Arm | Method | Status |
|-----|--------|--------|
| **G1** | 1Password extension inline autofill (not copy-from-vault) | **open** — different fill path than Bitwarden; user may not have license |
| **G1b** | Bitwarden extension inline autofill | **done 2026-08-13** — input-only, see below |
| **G2** | Vault → copy → ⌘V (Bitwarden stand-in for 1Password G2) | **done** — Maccy control confirmed |
| **G3** | **Chrome built-in address autofill** | **done** — two paths: input-only (clean) + paste (original); see below |

**Record per arm:** `pasteFields`, `unattributedKeydowns`, `contextMenuCountInFill`, `pointerRightCountInFill`, `layerD.verdict`. **Per field:** `pastes` vs `events` (input) with no paste.

### Arm G results — Bitwarden (2026-08-13)

**G1b — Bitwarden extension autofill**

| Signal | Result |
|--------|--------|
| paste | **0/5** |
| unattributed keydowns | **10** (~2/field, likely UI interaction) |
| contextMenuCountInFill | **0** |
| pointerRightCountInFill | **0** |
| verdict | **`not-agent-necessary-fail`** |

Per field: **`input` event only, `pastes=0`, `pasteObserved=false`** on all five shared fields. **Not a false positive** — fails necessary on paste count and keydowns. **Structurally invisible to paste gate** for this implementation.

**G2 — Bitwarden vault → copy → ⌘V**

| Signal | Result |
|--------|--------|
| paste | **5/5** |
| unattributed keydowns | **17** |
| contextMenuCountInFill | **0** |
| verdict | **`not-agent-necessary-fail`** |

All fields: **`paste` events present.** Confirms autofill and ⌘V are **different mechanisms** (same as Maccy control).

**Read:** best outcome for Bitwarden autofill — **safe by construction** for this path, not by threshold.

### Arm G results — Chrome autofill (2026-08-14)

**G3 original — programmatic paste (session noise on email)**

| Signal | Result |
|--------|--------|
| paste | **5/5** |
| unattributed keydowns | **2** |
| `necessaryPass` | **true** |
| contextMenuCountInFill | **3** (stray, on email) |
| verdict (as captured) | **`not-agent-disqualifier`** |
| Chrome | **150.0.0.0** |

Counterfactual without menus: **INCONCLUSIVE**. Per field: **`paste` events**.

**G3 clean — input-only bulk fill (v14)**

| Signal | Result |
|--------|--------|
| paste | **0/5** |
| unattributed keydowns | **5** |
| `necessaryPass` | **false** |
| contextMenuCountInFill | **0** |
| verdict | **`not-agent-necessary-fail`** |
| Chrome | **150.0.0.0** |
| fill mechanics | all **`input` only**, bulk ~14 ms |

Trusted mouse click on email (~90 ms); dropdown click not in page pointerStream.

**Read:** common Chrome path **safe by construction**. Paste path **observed once**, trigger unknown, same Chrome version. **Not “Chrome is an FP class”** — **“what selects the paste path?”** is the live residual. No further arms required unless bounded repro (2–3 tries) is explicitly queued.

### Pointer sanity (2026-08-14, v13)

Dedicated arm: one right-click → Paste on `email`.

| Check | Result |
|-------|--------|
| `pointerdown` fires? | **Yes** — `page.pointerDownLog` populated |
| `button` on deliberate right-click | **Sometimes `2`** — G3 session email menus show `recentPointerDowns` with `button: 0` then `button: 2` before `contextmenu`; pointer-sanity arm had `button: 0` only (882 ms before menu, outside 500 ms lookback) |
| Capture dead? | **No** — instrumentation alive |

**Closed:** pointer capture is not silent-dead. macOS Chrome is inconsistent on `button===2` timing/path; session windowless rule also counts `contextmenu`. iOS pointer traces from 2026-08-12 remain valid.

**Setup:** warm `https://probe.agentapt.tech/checkout.html`. **`__probeReset()` before each arm.** Confirm `probe.js?v=15`.

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
| Verdict under current rule | **`not-agent-disqualifier` (v15)** — necessary pass + trusted touch holds; was INCONCLUSIVE under contextmenu-only |

**Raw `pointerHolds` (the reason item 3 exists):** every shared field shows **two** touch holds — a short tap (~74–180 ms) then a long press (~842–1079 ms, median long ~925–938). Long-press `pointerup` ends ~940–1045 ms before the paste. `pointerType: touch`, `button: 0`, `trusted: true`.

Compare Comet v10 holds on the same fields: dwell **~0–2 ms** (focus clicks only).

**Read:** desktop/Android-style contextmenu disqualifier does **not** catch iOS. The long-touch dwell is now the **shipped** iOS arm of the unified gesture disqualifier (v15). Do not retune 400ms from this one sample without more traces.

Note: clipboard values in this run were the probe version-check snippet pasted into every field — fine for event signature, ignore content.

---

## 6. Probe pages

| URL | Arm |
|-----|-----|
| https://probe.agentapt.tech/checkout.html | Plain inputs |
| https://probe.agentapt.tech/checkout-controlled.html | React controlled + ZIP/phone rewrite |
| https://probe.agentapt.tech/checkout-typing-sim.html | Paste → synthetic per-char keydowns |

Retrieval: `__probeSave('tag')` / `__probeReset()` before clean arms. Prefer **fresh tab**; sessionStorage accumulates historical pages. Confirm `probe.js?v=17`. Beacon: `__probeBeacon()` when Harbour Lane has `BEACON_*` env injected. Payload may include `webdriver`; never `source_class`.

---

## 7. Ticket-ready summary

**Accepted 2026-08-17.** That acceptance unblocks the collector. Build against these numbers and bounds as written, including the “do not” list.

**Ship Layer D as page-tag behavioural fill detection** with:

1. Paste presence on ≥4 of 5 address fields as a **necessary** condition (not sufficient).
2. Unattributed keydown sum (paste-window attribution, 500ms) as a **necessary** keydown gate — not raw totals.
3. Structural **unified gesture disqualifier:** contextmenu / button===2 in fill span **or** trusted touch hold ≥400ms within 2000ms of paste → whole session not-agent. Per-field 2000ms lookback diagnostic only.
4. Necessary pass + silence → **INCONCLUSIVE** (never assert agent-detected).
5. Re-check zero-contextmenu assumption against every new agent in the matrix.
6. Documented FP residual: Chrome autofill **programmatic-paste path** (observed once G3 original, trigger unknown, frequency unknown, Chrome/150 on both captures); iOS long-press → **touch-hold gesture disqualifier** (back-test: iOS 5/5, Comet 0/5); 1Password open.
7. Documented FN: agents that **type** or **inject input-only**; agents that synthesize contextmenu (self-disqualify).
8. Install: theme embed / page script only — not a Shopify web pixel.

**Human classes — structural coverage (2026-08-14):**

| Class | Mechanism | Layer D today |
|-------|-----------|---------------|
| Desktop context-menu paste | `contextmenu` | windowless disqualifier ✓ |
| iOS long-press paste | touch hold ~900 ms | unified gesture disqualifier ✓ (v15, back-test iOS 5/5 Comet 0/5) |
| Bitwarden extension autofill | input-only | fails necessary ✓ |
| Chrome autofill (common path) | input-only bulk | fails necessary ✓ |
| Chrome autofill (rare path) | programmatic paste | INCONCLUSIVE if hit — **observed once, trigger unknown** |

**Three of four human classes structurally handled.** Strong enough position to build collector on.

**Input-only blind spot (ticket must state):** Layer D necessary conditions require paste. Input-only paths (Bitwarden, Chrome common) score **not-agent-necessary-fail** — safe for humans; **silent FN** if agents adopt input-only injection.

**Do not:** raise raw keydown caps to swallow masks; move primary onto fill span; retune 2000ms lookback; treat Maccy/⌘V as the residual FP (it fails necessary conditions); read phone into the necessary shared-five sum; claim agent from paste+unattr alone; widen the verdict CHECK with a positive “agent” value.

**Tolerances (§1):** `>= 4 of 5` and `<= 3` unattributed are precautionary for keydown classes. All-context-menu humans land at 0 unattr — necessary conditions do not separate them; windowless session disqualifier does. See §1.

**Committed alongside §7 (2026-08-17), not extra Layer D rule work:**

1. **Driver baseline** — point Browserbase/Playwright/Stagehand at Harbour Lane checkout; capture Layer D signature. Labeled ground truth for Tier 3 automation; answers whether our driver pastes or types.
2. **Comet cadence** — re-run the plain arm periodically and diff against stored baseline. Fill-mechanics change is a **product incident** (G3: same Chrome version, two autofill paths). Catches the §7 input-only FN if Comet ships it silently.

---

## 7a. Beacon first slice (Layer D ingest)

**Parallel path.** Does not feed `agent-traffic/` / `ParsedRequest`. Contract: `Beacon_Ingest_Contract_v1.md` @ scanner `1126a20`.

| Decision | Value |
|----------|--------|
| merchantId | Issued `site_key` (`beacon_sites`) |
| Supabase | Scanner project, `beacon_*` tables |
| Phase 0 origin | Harbour Lane only |
| Event grain | One checkout fill session |
| schemaVersion | Required on every event (`1`) |
| Counters | Stored with verdict (re-derivable) |

**Verdict CHECK (product rule, not just validation):** only  
`not-agent-necessary-fail` | `not-agent-disqualifier` | `inconclusive`.  
**`inconclusive` is the ceiling by design** — never store a positive “agent detected” without an explicit ticket + migration. Do not widen the CHECK “just in case.”

**Applied on scanner Supabase (2026-08-15):** RLS on both tables (no permissive policies; service_role only). Trigger enforces `merchant_id = site_key` for `site_id`. Route asserts `merchantId === site.site_key` before insert (clean 4xx).

**Phase 0 emit path (secret never in page):** `probe.js` → same-origin `POST /api/beacon` on Render → server stamps `merchantId` from env, adds `x-beacon-secret`, forwards to scanner `POST /api/public/beacon`. Page inject: `{ siteKey, endpoint: "/api/beacon" }` only — `siteKey` on the page is vestigial; identity is the Render env stamp.

**Code:** `beacon/sql/001_beacon.sql`, `beacon/sql/003_source_class.sql`, `beacon/sql/004_env.sql`, `beacon/src/index.ts` (validation contract for scanner port), probe v18 emit (`webdriver` + optional `env`), `server.js` `/api/beacon` forward.

**Deploy — done 2026-08-17.** Scanner `POST https://agentapt.io/api/public/beacon` live and preflighted. Render env set (site key + ingest secret rotated). Forwarder proof: happy path, replay, bad verdict, empty body (auth then schema), invalid JSON. Rotate proof `antonello-rotate-001` → `eb6add4c-d02d-40c1-8bfe-936a052d374e` under new merchant_id, `origin_mismatch: false`; replay **200** with **`replay: true`** (not `duplicate: true`). Old site-key row deactivated.

**Self-scan pollution (schema, 2026-08-17 — detector later).** Own Browserbase/Playwright scans will fire merchant beacon events. Do not mark the driver (no UA suffix, query param, injected global). Add nullable `source_class` on `beacon_events` from day one (NULL = unclassified). Orthogonal to `verdict`; do not widen `provenance`. Client must not set `source_class` — ingest ignores it. Optional payload field `webdriver` (`navigator.webdriver`) stored as `beacon_events.webdriver`. Later detector: correlate `origin` host + `occurred_at` against `sandbox_runs` window; err toward first-party. Apply `003_source_class.sql` on scanner Supabase **before** the route starts inserting `webdriver`.

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

**Status:** Watch list only. Layer D rule **accepted 2026-08-17**. Collector unblocked; Kitesurf still not queued.
