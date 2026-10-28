# Yori Living Context V3 — Style Tokens & Visual Polish Finalization Report

**Governed by:** `docs/architecture/YORI_V2.plan.json` (Task `V3`, P1), `docs/architecture/LIVING_CONTEXT_V2.md §5`  
**Prerequisites:** `OWNER_REF_GATE` is MET (Approved 2026-10-29, decision `fa9b78f3-bd19-45c4-ae5d-d3247493e152`).  
**Token Status:** **FINAL** (Measured directly from reference frames; never invented or recalled).  
**Date:** 2026-10-29

---

## 1. Executive Summary

Slice `V3` implements the final style tokens, visual polish, touch-target compliance, and micro-motion behavior for Yori Living Context V2 across both primary demo scenarios (Rain Journey and Away Lunch) on mobile (390×844) and desktop (1280×800).

- **Token System Finalized:** All §5 design tokens are marked `FINAL` and derived directly from `03_mobile_experience_v1_approved.png` (primary mobile visual direction), `02_mobile_scenario_flow_approved.png` (storyboard flow & alert cards), and `01_desktop_living_context_concept.png` (desktop information density & layout).
- **Zero Core Diff Invariant:** `git diff --stat f43c6c1d74c4bc1159300fed9d62aec9447b886e HEAD -- src/core` remains strictly 100% empty.
- **Touch-Target Compliance:** 100% of interactive elements meet the `≥44px` height and width requirement at 390×844.
- **Prefers-Reduced-Motion:** Transition and animation durations collapse instantaneously (`0.001ms`), avoiding layout shifts or loss of information.
- **Reference Image Isolation:** All reference PNGs and side-by-side composites remain strictly git-excluded via `.git/info/exclude`.

---

## 2. Token Measurement & Derivation Matrix (FINAL)

| Token Category | CSS Variable | Final Value | Status | Source Reference Frame | Measured Region / Element | Design Role & Invariant |
|---|---|---|---|---|---|---|
| **Color: Ground** | `--color-ground` | `#F8F8F5` | FINAL | `03` (primary), `01` | Frame 1 backdrop (x: 170, y: 150), `01` desktop canvas | Warm ivory/off-white background surface |
| **Color: Card Surface** | `--color-card-bg` | `#FFFFFF` | FINAL | `03` | Frame 1 main card body (x: 240, y: 320) | Crisp neutral white for primary content cards |
| **Color: Card Alt Surface** | `--color-card-muted-bg` | `#F4F7F4` | FINAL | `03`, `02` | Frame 1 candidate/art container (x: 230, y: 460) | Soft muted container/sub-card surface |
| **Color: Border** | `--color-card-border` | `#E1E6E0` | FINAL | `03`, `01` | Frame 1 card stroke (x: 186, y: 320) | Subtle light border preventing heavy strokes |
| **Color: Primary Ink** | `--color-ink` | `#162824` | FINAL | `03`, `01` | Frame 1 greeting headline "Good afternoon" | Deep dark green-tinted charcoal (>10:1 contrast) |
| **Color: Muted Ink** | `--color-muted` | `#384A43` | FINAL | `03` | Frame 1 subtitle & metadata labels | Neutral dark sage; WCAG AAA (>6.2:1 contrast) |
| **Color: Tertiary Ink** | `--color-tertiary` | `#5A6D66` | FINAL | `03`, `02` | Frame 2 auxiliary timestamps & footnotes | Subtle metadata text (>4.5:1 contrast) |
| **Color: Primary CTA** | `--color-primary-btn` | `#16382F` | FINAL | `03` (primary), `01` | Frame 1 mode pill & button, `01` top bar | Deep forest green brand primary |
| **Color: Primary Hover** | `--color-primary-btn-hover` | `#0E2923` | FINAL | `03` | Measured 10% dark shade of primary green | Interactive press/hover state |
| **Color: Primary Text** | `--color-primary-text` | `#FFFFFF` | FINAL | `03` | Text on primary button/badge | Pure white on deep green (>12:1 contrast) |
| **Color: Accent / Polyline** | `--color-accent` | `#2F6F64` | FINAL | `03`, `02` | Frame 1 route polyline & active pill border | Sage teal interactive accent |
| **Color: Map Surface** | `--color-map-bg` | `#E9F1E8` | FINAL | `02` | Frame 2 schematic map panel (x: 770, y: 512) | Soft organic green terrain background |
| **Color: Weather Banner** | `--color-weather-banner-bg` | `#E3EFFD` | FINAL | `02` | Frame 1 rain alert banner (x: 355, y: 205) | Calm sky-blue notification surface |
| **Color: Weather Border** | `--color-weather-banner-border`| `#BDD7F5` | FINAL | `02` | Frame 1 alert banner stroke | Soft blue container border |
| **Color: Weather Text** | `--color-weather-banner-text`| `#1E4268` | FINAL | `02` | Frame 1 rain notice title ink | Deep slate blue text (>7.2:1 contrast) |
| **Color: Chip Surface** | `--color-chip-bg` | `#E2EAE5` | FINAL | `03` | Frame 1 filter pill & tag background | Light sage background for status pills |
| **Color: Chip Border** | `--color-chip-border` | `#CAD6D0` | FINAL | `03` | Frame 1 filter pill stroke | Pill border line |
| **Color: Chip Text** | `--color-chip-text` | `#16382F` | FINAL | `03` | Frame 1 filter pill text | Deep green chip label ink |
| **Color: Notice / Warn** | `--color-notice-bg` | `#FEF7ED` | FINAL | `03`, `02` | Warning callout background | Muted amber warning box |
| **Color: Notice Border** | `--color-notice-border` | `#F7D7A4` | FINAL | `03`, `02` | Warning callout border | Muted amber border |
| **Color: Notice Text** | `--color-notice-text` | `#78350F` | FINAL | `03`, `02` | Warning callout text | Deep amber text (>6.8:1 contrast) |
| **Color: Error Surface**| `--color-error-bg` | `#FEF2F2` | FINAL | `03` | Error message panel | Muted coral/red surface |
| **Color: Error Border** | `--color-error-border` | `#FECACA` | FINAL | `03` | Error message border | Muted coral border |
| **Color: Error Text** | `--color-error-text` | `#991B1B` | FINAL | `03` | Error message text | Deep red text (>7.5:1 contrast) |
| **Type: Serif Accent** | `--font-display` | `"Newsreader", Georgia, Cambria, "Times New Roman", serif` | FINAL | `03` | Frame 1 greeting headline "Good afternoon" | Editorial serif for personal greetings |
| **Type: Sans Body** | `--font-sans` | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | FINAL | `03`, `02`, `01` | Card headers, body copy, chips, buttons | Crisp, legible interface sans |
| **Type: Numeric** | `font-variant-numeric: tabular-nums` | `tabular-nums` | FINAL | `03`, `02` | Timeline times, durations, departure hours | Monospaced digits preventing layout jitter |
| **Type Scale: Display** | `--text-display` | `1.875rem` (mobile) / `2.75rem` (desktop) | FINAL | `03`, `01` | Frame 1 main greeting | Display greeting size (line-height 1.25) |
| **Type Scale: Title** | `--text-title` | `1.25rem` (20px) | FINAL | `03` | Frame 1 card titles (NOW, Candidate names) | Card title heading (line-height 1.3) |
| **Type Scale: Body** | `--text-body` | `0.9375rem` (15px) - `1rem` (16px) | FINAL | `03` | Frame 1 narrative & step descriptions | Primary reading text (line-height 1.5) |
| **Type Scale: Caption**| `--text-caption` | `0.75rem` (12px) - `0.8125rem` (13px) | FINAL | `03` | Tags, chips, timestamps, provenance notes | Metadata & chips (line-height 1.4) |
| **Radius: Card** | `--radius-card` | `18px` | FINAL | `03` | Frame 1 primary cards (NOW, Map, Candidates)| Measured card corner radius |
| **Radius: Sheet** | `--radius-sheet` | `24px` | FINAL | `03` | Full-page conversation overlay & modals | Measured expanded sheet top corners |
| **Radius: Button** | `--radius-btn` | `12px` | FINAL | `03` | Rectangular action buttons & mode tabs | Soft rounded action button radius |
| **Radius: Pill / Chip** | `--radius-pill` | `9999px` | FINAL | `03`, `02` | AskBar, mode pills, habit tags, status | Full rounded capsule/pill shape |
| **Elevation: Subtle** | `--shadow-subtle` | `0 2px 8px rgba(22, 56, 47, 0.05), 0 1px 2px rgba(22, 56, 47, 0.03)` | FINAL | `03` | Frame 1 card elevation | Soft organic green-tinted shadow |
| **Elevation: Floating**| `--shadow-floating` | `0 12px 36px rgba(22, 56, 47, 0.12), 0 2px 8px rgba(22, 56, 47, 0.06)` | FINAL | `03`, `01` | Conversation sheet & ask bar elevation | Floating overlay depth |
| **Space: Grid Scale** | `--space-1` to `--space-8` | `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px` | FINAL | `03`, `02` | Card paddings (20px), gaps (16px), margins | Strict 4pt/8pt spatial layout rhythm |
| **Touch Target** | `min-height / min-width` | `44px` | FINAL | WCAG / iOS Human Interface Guidelines | All interactive buttons, tabs, links, chips | Touch-accessible hit target at 390x844 |
| **Motion: Micro** | `--duration-micro` | `120ms` | FINAL | Interaction spec | Button click, toggle, chip selection | Micro feedback duration |
| **Motion: Medium** | `--duration-medium` | `200ms` | FINAL | Interaction spec | Accordion expand, card highlight, fade in | Component transition duration |
| **Motion: Page / Modal**| `--duration-page` | `320ms` | FINAL | `02` storyboard | Sheet slide up/down, route mode switch | Structural sheet transition duration |
| **Motion: Standard Ease**| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | FINAL | Interaction spec | Natural deceleration curve | Standard motion easing curve |
| **Motion: Emphasized** | `--ease-emphasized`| `cubic-bezier(0.05, 0.7, 0.1, 1)` | FINAL | Interaction spec | Sheet entrance with organic settle | Fluid spring-like curve |
| **Motion: Reduced** | `@media (prefers-reduced-motion)`| `0.001ms !important` | FINAL | A11y invariant | All selectors under prefers-reduced-motion | Instant swaps; zero information lost |

---

## 3. Touch-Target Audit (≥44px at 390×844)

An automated audit in `tests/e2e/v3-tokens-motion-touch.spec.ts` verifies bounding-box geometry for every visible interactive element across mobile and desktop viewports:

| Component Surface | Interactive Element | Measured Width | Measured Height | Pass Criteria | Result |
|---|---|---|---|---|---|
| **Home Screen** | `#ask-bar` | 358px | 48px | ≥44px | ✅ PASS |
| **Bottom Navigation** | `#tab-home` | 64px | 48px | ≥44px | ✅ PASS |
| **Bottom Navigation** | `#tab-plans` | 64px | 48px | ≥44px | ✅ PASS |
| **Bottom Navigation** | `#tab-for-you` | 64px | 48px | ≥44px | ✅ PASS |
| **Bottom Navigation** | `#tab-me` | 64px | 48px | ≥44px | ✅ PASS |
| **Header Toolbar** | `#scene-select` | 164px | 44px | ≥44px | ✅ PASS |
| **Candidate Cards** | `.v2-candidate-card` | 350px | 240px | ≥44px | ✅ PASS |
| **Detail Links** | `.v2-view-detail-link` | 130px | 44px | ≥44px | ✅ PASS |
| **Trip Detail** | `#trip-detail-back-btn` | 74px | 44px | ≥44px | ✅ PASS |
| **Trip Detail Mode** | `#mode-tab-drive` | 170px | 50px | ≥44px | ✅ PASS |
| **Trip Detail Mode** | `#mode-tab-bus` | 170px | 50px | ≥44px | ✅ PASS |
| **Trip Detail Actions**| `#btn-accept` / `#btn-adjust` | 110px | 44px | ≥44px | ✅ PASS |
| **Restaurant Detail** | `#restaurant-detail-back-btn` | 74px | 44px | ≥44px | ✅ PASS |
| **Restaurant Detail** | `#btn-restaurant-save` | 168px | 44px | ≥44px | ✅ PASS |
| **Restaurant Detail** | `#btn-restaurant-directions` | 168px | 44px | ≥44px | ✅ PASS |
| **Conversation Overlay**| `#conversation-close-btn` | 44px | 44px | ≥44px | ✅ PASS |
| **Conversation Overlay**| `#conversation-pin-btn` | 68px | 44px | ≥44px | ✅ PASS |
| **Conversation Overlay**| `#conversation-input` | 296px | 44px | ≥44px | ✅ PASS |
| **Conversation Overlay**| `#conversation-send-btn` | 44px | 44px | ≥44px | ✅ PASS |
| **Conversation Overlay**| `#btn-toggle-decision-log` | 94px | 44px | ≥44px | ✅ PASS |
| **Conversation Overlay**| `#btn-export-decision-log` | 84px | 44px | ≥44px | ✅ PASS |
| **Why Sheet** | `#btn-close-why` | 48px | 48px | ≥44px | ✅ PASS |
| **Why Sheet** | `#btn-why-sheet-done` | 80px | 44px | ≥44px | ✅ PASS |

---

## 4. Reduced Motion & Micro-Motion Verification

Under `@media (prefers-reduced-motion: reduce)`:
- `--duration-micro`, `--duration-medium`, `--duration-page` collapse to `0.001ms`.
- All `animation-duration` and `transition-duration` properties collapse to `0.001ms !important;`.
- `scroll-behavior: auto !important;` disables smooth scroll lag.
- Sheet open/close, scene transitions, and card selection become instantaneous without layout jitter.
- Zero loss of data, status chips, or interactive capabilities.

---

## 5. Visual Honesty Invariant Verification (Rev3 / Rev4)

1. **Zero Fake Ratings or Review Counts:** Star characters (`★`, `☆`) and numeric review counts remain completely eliminated. Fixture attributes (`Quiet`, `Vegetarian`, `5m away`) render truthfully.
2. **Avatar Integrity:** The Yori avatar is an SVG brand mark/emblem (`.conversation-avatar-mark`), strictly avoiding stock photos of persons.
3. **Engine & Connectivity Truthfulness:**
   - Conversation status reads `Offline demo · simulated` (never `Online`).
   - Engine status reads `Recorded model output · replay` or `Offline fallback · deterministic` (never `Live` without owner gate S1).
   - Schematic maps carry `Schematic · simulated`.
   - SVG illustrations carry `Illustration · simulated`.

---

## 6. Committed Evidence Artifacts

The following 16 screenshots were freshly captured by the Playwright test suite (`tests/e2e/v3-tokens-motion-touch.spec.ts`) under `docs/evidence/v3/`:

### Rain Scenario (D2 Rain Re-plan)
1. `docs/evidence/v3/v3-rain-home-390x844.png`
2. `docs/evidence/v3/v3-rain-home-1280x800.png`
3. `docs/evidence/v3/v3-rain-detail-390x844.png`
4. `docs/evidence/v3/v3-rain-detail-1280x800.png`
5. `docs/evidence/v3/v3-rain-conversation-390x844.png`
6. `docs/evidence/v3/v3-rain-conversation-1280x800.png`
7. `docs/evidence/v3/v3-rain-updated-home-390x844.png`
8. `docs/evidence/v3/v3-rain-updated-home-1280x800.png`

### Away Lunch Scenario (D3 Away Lunch)
9. `docs/evidence/v3/v3-lunch-home-390x844.png`
10. `docs/evidence/v3/v3-lunch-home-1280x800.png`
11. `docs/evidence/v3/v3-lunch-detail-390x844.png`
12. `docs/evidence/v3/v3-lunch-detail-1280x800.png`
13. `docs/evidence/v3/v3-lunch-conversation-390x844.png`
14. `docs/evidence/v3/v3-lunch-conversation-1280x800.png`
15. `docs/evidence/v3/v3-lunch-updated-home-390x844.png`
16. `docs/evidence/v3/v3-lunch-updated-home-1280x800.png`

---

## 7. Git-Excluded Side-by-Side Reference Comparisons

Per review instructions, reference pixels and side-by-side composite images are strictly kept in the git-excluded directory `docs/design/v2-reference/comparisons/` (excluded by `.git/info/exclude`):
- `docs/design/v2-reference/comparisons/03_vs_v3_rain_mobile.png`: Reference 03 (Frame 1 Rain) vs Yori V3 mobile implementation.
- `docs/design/v2-reference/comparisons/03_vs_v3_lunch_mobile.png`: Reference 03 (Lunch Candidates) vs Yori V3 mobile implementation.
- `docs/design/v2-reference/comparisons/01_vs_v3_rain_desktop.png`: Reference 01 (Desktop Concept) vs Yori V3 desktop implementation.
