# Desktop Scroll Polish Evidence (DESKTOP-SCROLL-POLISH)

Governed by Task `[TID:INBOX-20261101-D2B47E]` and `UI_EVIDENCE_REVIEW_PROTOCOL.md`.

## Defect Summary & Fix Details

### 1. [P2] Desktop Shell Scroll & Divider Containment
- **Problem**: At 1024×768, 1280×800, and 1440×900, mouse wheel scroll scrolled the outer page (`scrollY: 341`), causing the left navigation to scroll off (top=-245) with column dividers and backgrounds ending at y≈459, exposing bare ground below. Furthermore, at 1024×768, center cards (such as `.now-card`) extended past the column divider into the right panel.
- **Fix**:
  - Enforced `height: 100vh; max-height: 100vh; overflow: hidden;` on `html, body` and `.app-layout[data-ui-version="v2"]` under `@media (min-width: 1024px)`.
  - Pinned `.desktop-left-nav`, `.desktop-center-column`, and `.desktop-right-panel` to `height: 100vh; max-height: 100vh;`.
  - Added internal scrolling (`overflow-y: auto; overflow-x: hidden;`) to `.desktop-center-column` and `.desktop-right-panel`.
  - Normalized padding on `.desktop-center-column` (`padding: 24px 20px 80px 20px;`) and `.app-layout[data-ui-version="v2"] .desktop-center-column .main-container` (`padding: 0; max-width: 680px;`).
  - Added `flex-wrap: wrap; gap: 6px;` to `.map-header`, `.desktop-map-header`, and `.now-map-strip .map-strip-header` to prevent min-content blowout.
- **Result**: `window.scrollY` remains strictly 0 under any mouse wheel scroll. All 6 left-nav items stay visible (`top >= 0, bottom <= viewportHeight`), column dividers and backgrounds span 100% of the viewport height, and no center card crosses the left or right column dividers.

### 2. [P3] Rain NOW Card Chip Row
- **Problem**: At 390×844 and 1280×800 (scene rain), copy was duplicated ("Take umbrella · Umbrella needed" pill next to "Rain forecast · Umbrella needed"). A stray "·" separator wrapped onto its own line above a detached "Drive". At 390×844 the items crushed into narrow multi-line columns.
- **Fix**:
  - In `src/ui/living-context/v2-home-view.ts`: `#chip-umbrella` now cleanly renders `Umbrella` with icon; rationale text is `Rain forecast`; active mode badge uses non-breaking `·&nbsp;Drive` / `·&nbsp;Bus`.
  - In `src/ui/living-context/styles.css`: `.now-rationale-line` now has `flex-wrap: wrap; gap: 6px 8px;`. `#chip-umbrella`, `.v2-active-mode-badge`, and `.now-rationale-forecast` have `white-space: nowrap;`.
- **Result**: Zero duplicated "Umbrella needed", zero orphan separators, and at 390×844 the rationale row fits comfortably without wrapping to $\ge 3$ lines.

### 3. [P3] Desktop Right Panel Thumbnails & Heading
- **Problem**: At 1280×800 (scene away-lunch), 60×60px place thumbnails showed clipped text ("stration" / "ulated") due to the 140px `desktop-illustration-badge` overflowing the thumbnail. The section heading "NEARBY OPTIONS & WA…" was truncated against the "Schematic · simulated" badge.
- **Fix**:
  - In `src/ui/living-context/styles.css`:
    - `.desktop-candidate-art .desktop-illustration-badge { display: none !important; }`
    - `.desktop-panel-places-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 12px; }`
    - `.desktop-panel-places-header .section-label { white-space: normal; overflow: visible; text-overflow: clip; margin-bottom: 0; }`
- **Result**: Zero clipped badge text inside thumbnails. Heading is not ellipsized (`scrollWidth <= clientWidth + 1`).

---

## Evidence Matrix (34 Deliverables)

| Viewport | Scene / View | Before File | After File | Status |
|---|---|---|---|---|
| 1024×768 | Home clear | `before-demo-clear-1024x768.png` | `after-demo-clear-1024x768.png` | Fixed: Shell pinned, nav visible, dividers full height |
| 1024×768 | Home rain | `before-demo-rain-1024x768.png` | `after-demo-rain-1024x768.png` | Fixed: Shell pinned, rain chip clean, dividers full height |
| 1024×768 | Home away-lunch | `before-demo-away-lunch-1024x768.png` | `after-demo-away-lunch-1024x768.png` | Fixed: Shell pinned, cards within dividers |
| 1024×768 | Home multi-candidate | `before-demo-multi-candidate-1024x768.png` | `after-demo-multi-candidate-1024x768.png` | Fixed: Shell pinned, cards within dividers |
| 1024×768 | For You | `before-for-you-1024x768.png` | `after-for-you-1024x768.png` | Fixed: Shell pinned, nav visible |
| 1280×800 | Home clear | `before-demo-clear-1280x800.png` | `after-demo-clear-1280x800.png` | Fixed: Shell pinned, scrollY=0, nav visible |
| 1280×800 | Home rain | `before-demo-rain-1280x800.png` | `after-demo-rain-1280x800.png` | Fixed: Shell pinned, rain chip clean, scrollY=0 |
| 1280×800 | Home away-lunch | `before-demo-away-lunch-1280x800.png` | `after-demo-away-lunch-1280x800.png` | Fixed: Right panel heading clean, no thumb badge clipping |
| 1280×800 | Home multi-candidate | `before-demo-multi-candidate-1280x800.png` | `after-demo-multi-candidate-1280x800.png` | Fixed: Shell pinned, cards within dividers |
| 1280×800 | For You | `before-for-you-1280x800.png` | `after-for-you-1280x800.png` | Fixed: Shell pinned, nav visible |
| 1440×900 | Home clear | `before-demo-clear-1440x900.png` | `after-demo-clear-1440x900.png` | Fixed: Shell pinned, comfortable measure |
| 1440×900 | Home rain | `before-demo-rain-1440x900.png` | `after-demo-rain-1440x900.png` | Fixed: Shell pinned, rain chip clean |
| 1440×900 | Home away-lunch | `before-demo-away-lunch-1440x900.png` | `after-demo-away-lunch-1440x900.png` | Fixed: Right panel clean, shell pinned |
| 1440×900 | Home multi-candidate | `before-demo-multi-candidate-1440x900.png` | `after-demo-multi-candidate-1440x900.png` | Fixed: Shell pinned, cards within dividers |
| 1440×900 | For You | `before-for-you-1440x900.png` | `after-for-you-1440x900.png` | Fixed: Shell pinned, nav visible |
| 390×844 | Home rain | `before-demo-rain-390x844.png` | `after-demo-rain-390x844.png` | Fixed: Rain chip clean, no orphan separator, no horizontal scroll |
| 390×844 | Home away-lunch | `before-demo-away-lunch-390x844.png` | `after-demo-away-lunch-390x844.png` | Fixed: Mobile candidates clean, no horizontal scroll |
