# Layer D — Lab sequence (form-fill signature)

**Status:** Lab closed for rule shape. Collector not started.  
**Harness:** [agentapt-phase0-probe](https://github.com/sfitzsimmons03-eng/agentapt-phase0-probe) · live `https://probe.agentapt.tech`  
**Probe:** `probe.js` v9+ (paste survival + paste-aware keydown attribution)  
**Date:** 2026-08-10  
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
paste_fields >= 4 of 5 shared checkout fields
AND
sum(keydownsUnattributed) across those fields <= 3
```

Shared fields on Harbour Lane: `name`, `email`, `address`, `city`, `postcode`.

Phone is **instrumented but out of gate scope**. It is useful for stressing masks and understanding event shape, but the decision rule sums only across the five shared address fields above.

**Measured vs precautionary (read before building on this rule):**

Both tolerances in the decision block are **insurance**, not lab-validated slack. The data supports a sharper rule; the caps are kept for margin.

| Parameter | What the arms show | What the rule says | Status |
|-----------|-------------------|-------------------|--------|
| Unattributed keydowns | Every Comet arm **exactly 0**. Nearest negative: autofill at **5**. Nothing has ever landed at 1, 2, or 3. | `<= 3` | **Precautionary, unmeasured** — leftover from the raw-total era before attribution. The measured gap is 0 → 5. If a future run lands at 1 or 2, treat it as a **surprise worth investigating**, not as the rule working as designed. |
| Paste field count | Every arm is **5/5 or 0/5**. Nothing has produced 3 or 4. | `>= 4 of 5` | **Untested tolerance** — insurance against a partial-paste case we have never observed. Fine to keep; do not read it as validated partial-paste behaviour. |
| Paste-attribution window | Typing-sim attributed fully to zero unattributed keydowns. We did **not** measure the full offset distribution or the observed maximum across all attributed keydowns. | `[0, 500ms]` | **Precautionary, partially measured** — we know 500ms was sufficient for the typing-sim arm, not that it is tight. Record observed maxima on future runs before treating this as a calibrated boundary. |

**Why this shape (not “raise the keydown cap”):**

- A masked ZIP that rebuilds paste char-by-char manufactures keydowns *after* paste. Raising `≤3` → `≤12` fixes one mask and dies on the next. Attribution measures the mask, not the agent.
- Keyboard clipboard fill (⌘V / Maccy) manufactures keydowns *before* paste. Those cannot attribute to a paste that has not fired yet. Same instrumentation separates that class for free.
- Comet has no keyboard involvement: paste without preceding shortcut keydowns → unattributed ≈ 0.

**Corroboration only (do not promote to primary):** fill span ~1.1–1.4s and ~5 INPUT clicks on Comet. Timing alone is fragile and should not become the primary gate. Its specific job is narrower: it separates Comet from **human clipboard paste** classes that can match the primary signal (`paste 5/5`, unattributed `0`, ~5 clicks) while still taking materially longer.

**Paste survival instrumentation (kept):** per-field `pasteObserved`, clipboard vs landed `exactMatch` / `digitsMatch` (sample after mask rewrite). Masks that format (phone) correctly show exactMatch false + digitsMatch true.

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

## 3. Negative arms (must not fire)

| Arm | paste | raw kd | unattr | fill span | Rule |
|-----|------:|-------:|-------:|----------:|:----:|
| Manual typing | 0/5 | 49 | **49** | ~6670 ms | fail |
| Chrome autofill | 0/5 | 5 | **5** | ~1 ms | fail |
| Bitwarden (inject) | 0/5 | ~16 | **~16** | ~273 ms | fail |
| Maccy / ⌘V clipboard | 5/5 | 11 | **11** | ~5674 ms | fail |
| Human right-click / long-press paste | not run | expected 0 | expected 0 | expected slower than Comet | **known untested gap** |

### Maccy mechanism (2026-08-10)

Paste 5/5, exactMatch true. Per-field keydown offsets were `null` (keydown before `lastPasteAt`). Typical ⌘V: Meta/V fire, then `paste`. Unattributed 11 → rule fails.

Structural, not tuned: Comet never fires those shortcut keydowns.

### Human clipboard paste gap

We did **not** run the ordinary human paste path: click/tap into a field, then context-menu **Paste** (desktop right-click or mobile long-press). That path can fire a `paste` event with no keyboard events at all, which means:

- `paste 5/5`
- `keydownsUnattributed 0`
- INPUT clicks roughly in the Comet range

That makes it the most common untested false-positive class in the current lab sequence. The likely separator is **fill span**, not the primary gate. Keep this explicit until a desktop right-click and mobile long-press arm are run.

---

## 4. Known evasion / residual classes

State explicitly. Do not pretend the rule covers them.

### 4a. False positive — programmatic-paste PWM / extension

**Shape:** injects field values via a synthetic `paste` (or paste-like path) with **no** preceding keystrokes.

**Why it matches:** same primary signature as Comet — paste ≥4, unattributed keydowns ≈ 0.

**What we tested that is *not* this class:** Bitwarden inject (paste=0), Maccy keyboard-clipboard (pre-paste keydowns).

**Bound:** extension-based or API managers that synthesize paste without keyboard. Known, bounded. Do not chase before collector; ticket should list as accepted FP class or as a follow-up arm.

### 4b. False positive — human context-menu paste

**Shape:** a real person clicks/taps into each field and pastes from the context menu (desktop right-click or mobile long-press), so the page sees `paste` with no keyboard shortcut before it.

**Why it matches:** same primary signature as Comet is plausible — paste on every field, unattributed keydowns at 0, and click count in the same rough band. The likely differentiator is slower fill span.

**What we tested that is *not* this class:** Maccy / ⌘V keyboard clipboard, which fails because the shortcut keydowns happen before paste.

**Bound:** common in real user behavior, especially on mobile. Still unmeasured in this sequence; ticket should call it out as an open false-positive class unless/until a dedicated arm is run.

### 4c. False negative — agent that types instead of pastes

**Shape:** agent fills by synthesizing keydown/input per character (or real typing automation) with **paste=0**.

**Why it misses:** rule requires paste on ≥4 fields. Looks like manual or Bitwarden-ish keydown noise, not Comet.

**Bound:** any agent (or future Comet mode) that abandons clipboard paste for typing. Out of scope for this Layer D primary; would need a different signal (timing/jitter, click pattern, or declared Layer A).

### 4d. Out of scope but related

- **Shopify web pixel:** no `document` → cannot run Layer D at all. Theme app embed (or equivalent page script) is the install path. Desk research; not an arm.
- **Layers A/B/C:** UA grep / Atlas favicon / Comet DOM inject — separate verdicts; not part of this sequence.

---

## 5. Lab sequence (what was run, in order)

1. Plain checkout — Comet baseline (paste + near-zero keydown).
2. Controlled React + rewrite masks — paste survival; keydown threshold not defended.
3. Typing-sim mask (paste → char-by-char synthetic keydowns) — false-negative risk for raw totals.
4. Paste-aware instrumentation + back-test on existing arms (Comet ×3, manual, autofill, Bitwarden).
5. Keyboard clipboard-fill (Maccy) — pre-paste keydown lookalike; cleared under paste-aware rule.
6. Human context-menu paste — **not run**; left explicit as the most common open false-positive class.

**Not run / deferred:** programmatic-paste extension PWM (residual 4a), human context-menu paste / mobile long-press paste (residual 4b), Kitesurf arm (§8), collector / `beacon.js` (sequencing: testers first on AgentApt side).

---

## 6. Probe pages

| URL | Arm |
|-----|-----|
| https://probe.agentapt.tech/checkout.html | Plain inputs |
| https://probe.agentapt.tech/checkout-controlled.html | React controlled + ZIP/phone rewrite |
| https://probe.agentapt.tech/checkout-typing-sim.html | Paste → synthetic per-char keydowns |

Retrieval: `__probeSave('tag')` / `__probeReset()` before clean arms. Prefer fresh session; sessionStorage accumulates historical pages.

---

## 7. Ticket-ready summary

**Ship Layer D as page-tag behavioural fill detection** with:

1. Paste presence on ≥4 of 5 address fields as primary.
2. Unattributed keydown sum (paste-window attribution, 500ms) as the keydown gate — not raw keydown totals.
3. Documented FP: programmatic paste with no keystrokes.
4. Documented FP: human context-menu paste (desktop/mobile) pending dedicated arm.
5. Documented FN: agents that type instead of paste.
6. Install: theme embed / page script only — not a Shopify web pixel.

**Do not:** raise raw keydown caps to swallow masks; treat Maccy/⌘V as the residual FP (it is not); read phone keydowns into the shared-five gate; start collector before this writeup is accepted as the detection contract.

**Tolerances (§1):** `>= 4 of 5` and `<= 3` unattributed are precautionary caps — measured Comet is 5/5 paste and 0 unattr; nearest failure is 5 unattr. See §1 table before interpreting slack as observed behaviour.

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
