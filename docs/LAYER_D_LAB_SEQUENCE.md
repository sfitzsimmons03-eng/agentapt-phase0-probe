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

**Why this shape (not “raise the keydown cap”):**

- A masked ZIP that rebuilds paste char-by-char manufactures keydowns *after* paste. Raising `≤3` → `≤12` fixes one mask and dies on the next. Attribution measures the mask, not the agent.
- Keyboard clipboard fill (⌘V / Maccy) manufactures keydowns *before* paste. Those cannot attribute to a paste that has not fired yet. Same instrumentation separates that class for free.
- Comet has no keyboard involvement: paste without preceding shortcut keydowns → unattributed ≈ 0.

**Corroboration only (do not promote to primary):** fill span ~1.1–1.4s and ~5 INPUT clicks on Comet. Timing alone is fragile; clicks help vs autofill (1 click) but are secondary.

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

Intermittent Comet plain with postcode `keydown=1` + paste: reconstructs to unattr 0 under paste-aware accounting (same window).

---

## 3. Negative arms (must not fire)

| Arm | paste | raw kd | unattr | fill span | Rule |
|-----|------:|-------:|-------:|----------:|:----:|
| Manual typing | 0/5 | 49 | **49** | ~6670 ms | fail |
| Chrome autofill | 0/5 | 5 | **5** | ~1 ms | fail |
| Bitwarden (inject) | 0/5 | ~16 | **~16** | ~273 ms | fail |
| Maccy / ⌘V clipboard | 5/5 | 11 | **11** | ~5674 ms | fail |

### Maccy mechanism (2026-08-10)

Paste 5/5, exactMatch true. Per-field keydown offsets were `null` (keydown before `lastPasteAt`). Typical ⌘V: Meta/V fire, then `paste`. Unattributed 11 → rule fails.

Structural, not tuned: Comet never fires those shortcut keydowns.

---

## 4. Known evasion / residual classes

State explicitly. Do not pretend the rule covers them.

### 4a. False positive — programmatic-paste PWM / extension

**Shape:** injects field values via a synthetic `paste` (or paste-like path) with **no** preceding keystrokes.

**Why it matches:** same primary signature as Comet — paste ≥4, unattributed keydowns ≈ 0.

**What we tested that is *not* this class:** Bitwarden inject (paste=0), Maccy keyboard-clipboard (pre-paste keydowns).

**Bound:** extension-based or API managers that synthesize paste without keyboard. Known, bounded. Do not chase before collector; ticket should list as accepted FP class or as a follow-up arm.

### 4b. False negative — agent that types instead of pastes

**Shape:** agent fills by synthesizing keydown/input per character (or real typing automation) with **paste=0**.

**Why it misses:** rule requires paste on ≥4 fields. Looks like manual or Bitwarden-ish keydown noise, not Comet.

**Bound:** any agent (or future Comet mode) that abandons clipboard paste for typing. Out of scope for this Layer D primary; would need a different signal (timing/jitter, click pattern, or declared Layer A).

### 4c. Out of scope but related

- **Shopify web pixel:** no `document` → cannot run Layer D at all. Theme app embed (or equivalent page script) is the install path. Desk research; not an arm.
- **Layers A/B/C:** UA grep / Atlas favicon / Comet DOM inject — separate verdicts; not part of this sequence.

---

## 5. Lab sequence (what was run, in order)

1. Plain checkout — Comet baseline (paste + near-zero keydown).
2. Controlled React + rewrite masks — paste survival; keydown threshold not defended.
3. Typing-sim mask (paste → char-by-char synthetic keydowns) — false-negative risk for raw totals.
4. Paste-aware instrumentation + back-test on existing arms (Comet ×3, manual, autofill, Bitwarden).
5. Keyboard clipboard-fill (Maccy) — pre-paste keydown lookalike; cleared under paste-aware rule.

**Not run / deferred:** programmatic-paste extension PWM (residual 4a). Collector / `beacon.js` (sequencing: testers first on AgentApt side).

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
4. Documented FN: agents that type instead of paste.
5. Install: theme embed / page script only — not a Shopify web pixel.

**Do not:** raise raw keydown caps to swallow masks; treat Maccy/⌘V as the residual FP (it is not); start collector before this writeup is accepted as the detection contract.
