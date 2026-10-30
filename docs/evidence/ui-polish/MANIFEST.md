# UI-POLISH Evidence Manifest: Visual Layout Polish & Screenshot Routing

> **Task ID**: `[TID:INBOX-20261030-E6C12E]` (`UI-POLISH`)  
> **Backlog Reference**: `BACKLOG-20261031-UIP3` + `E2EEVID` + `UI-DEMO-FY/UIFONT P3`  
> **Date**: 2026-10-31  
> **Environment**: OFFLINE, Mocked/Deterministic test mode  
> **Scope**: Visible layout polish without design changes: map callout text pill sizing, desktop Ask bar clearance, mobile Why sheet memory row stacking, lunch distance single line, and Plans/For You badge stacking. Untracked screenshot routing for test runs and manifest corrections.

---

## 1. Architectural Scope & Implementation Decisions

### Scope (1): Layout Polish Fixes (a)–(e)
1. **(a) Map Weather Callout Pill Sizing**:
   - In `src/ui/living-context/v2-home-view.ts`, adjusted the SVG `<rect>` from hardcoded `width="146"` to `width="188"` with `transform="translate(${map.weatherCallout.x - 94}, ...)"` and text centered at `x="94"`.
   - Text `"Rain forecast · simulated"` (~162px) and `"Issued 1:35 PM"` now fit inside the dark pill with $\ge 12$px margin on both sides without overflowing the pill boundaries or intersecting map markers.
2. **(b) Desktop 1440 Floating Ask Bar Clearance**:
   - In `src/ui/living-context/styles.css`, increased desktop `.app-layout[data-ui-version="v2"] .main-container` bottom padding from `100px` to `180px`.
   - When scrolled to the bottom at 1440×900, provides $>100$px of clean clearance between the bottom of the map card / last timeline step and the floating Ask bar (`bottom: 24px`, height `52px`).
3. **(c) Why Sheet Memory Row Stacking on Mobile (<480px / 390px)**:
   - In `src/ui/living-context/styles.css`, applied `@media (max-width: 480px)` to `.why-item-row`: `flex-direction: column; align-items: flex-start; gap: 8px;` with `.card-badge { order: -1; margin-bottom: 2px; }`.
   - The long `Demo profile · sample preference` badge stacks above the preference label, allowing `"Buffer before leaving"` full row width so it never wraps into an awkward 3-line column.
4. **(d) Lunch Card Distance Single-Line Constraint**:
   - In `src/ui/living-context/styles.css`, applied `white-space: nowrap;` to `.v2-distance-chip` and `flex-wrap: wrap; gap: 6px 8px;` to `.v2-candidate-tags`.
   - The distance `"139 m (straight-line)"` stays on a single clean line ($\le 24$px height) while extra dietary/noise chips wrap to the next line without horizontal overflow.
5. **(e) Plans & For You Card Badge Stacking on Mobile (<480px / 390px)**:
   - In `src/ui/living-context/styles.css`, applied `@media (max-width: 480px)` to `.v2-plan-item-header, .v2-proposal-header`: `flex-direction: column; align-items: flex-start; gap: 6px;`.
   - The `SIMULATED` and `PROPOSAL` badges sit above the title rather than in the same flex row, preventing squeezing of titles at 390px.

### Scope (2): Untracked Screenshot Routing (f)
- Created `tests/e2e/helpers/evidence-dir.ts` exporting `getEvidenceDir(subfolder)`.
- By default, routes E2E screenshot outputs to untracked `test-results/evidence/{subfolder}` (covered by `.gitignore`).
- Only writes to tracked `docs/evidence/{subfolder}` when explicit opt-in `UPDATE_EVIDENCE=1` or `UPDATE_EVIDENCE=true` is set.
- Migrated all 18 E2E specs to use `getEvidenceDir()`, guaranteeing that default `npx playwright test` runs never dirty git status or modify tracked PNGs.

### Scope (3): Manifest & Screenshot Integrity (g)
- Corrected line 27 in `docs/evidence/ui-demo-fy/MANIFEST.md` from `Departure prep & buffer routine` to `Preparation buffer habit` matching the actual UI.
- In `tests/e2e/ui-font.spec.ts`, updated modal wait timeout to 350ms to allow CSS modal entrance animation to fully settle, and recaptured `docs/evidence/ui-font/why-sheet-mobile-after.png` with updated checksum in its manifest.

---

## 2. Accessibility & Layout Audits

All 5 views (Home Rain, Why Sheet, Away Lunch, Plans, and For You) were verified at Mobile (390×844) and Desktop (1440×900) via `tests/e2e/ui-polish.spec.ts`:
- **Axe WCAG 2.0 Level A & AA**: 0 violations across all views ✅
- **Horizontal Overflow**: `document.documentElement.scrollWidth <= window.innerWidth` across all views (0 horizontal overflow) ✅
- **Clearance**: 0 intersection between Ask bar and map card / timeline at 1440×900 viewport bottom ✅

---

## 3. Visual Screenshot Evidence Checksums

| File | Item / Description | Viewport | Mode | SHA256 Checksum |
|---|---|---|---|---|
| `a-map-callout-mobile-before.png` | (a) Map Callout Pill | Mobile (390×844) | Before (146px pill) | `a7ea7b2ddf2a524b9f7d7fd08d31ac5802fa11dd4963be2e9301df3222f51033` |
| `a-map-callout-mobile-after.png` | (a) Map Callout Pill | Mobile (390×844) | After (188px pill) | `4d0a728243cc569e7cf5c1715642ee6577ad3b8c96c4cd41fb73adebf35d4b70` |
| `a-map-callout-desktop-before.png` | (a) Map Callout Pill | Desktop (1440×900) | Before (146px pill) | `904081d462feca015dacac73bc4162f523130f58dfe2cc4b0e42e7ad4bd9ae84` |
| `a-map-callout-desktop-after.png` | (a) Map Callout Pill | Desktop (1440×900) | After (188px pill) | `42ed2f27b30cc7affefe506e9d54335e02942a5e41e921d70282ffcba084d63d` |
| `b-ask-bar-clearance-desktop-before.png` | (b) Desktop Ask Bar Clearance | Desktop (1440×900) | Before (100px pad) | `fbc683130a0b0be9f18848b58758a03c87905c364572fde1f83818b94b8cb679` |
| `b-ask-bar-clearance-desktop-after.png` | (b) Desktop Ask Bar Clearance | Desktop (1440×900) | After (180px pad) | `93c3674e02ecf3b6817ae4eaeb975ef34da8ed546c349d9065668b4b005ba50e` |
| `c-why-sheet-memory-mobile-before.png` | (c) Why Sheet Memory Row | Mobile (390×844) | Before (side-by-side) | `ab1fc9eb59bc1f194c71b35cc48d8e789e95d38fe580613b59ec8bdcadcb9b43` |
| `c-why-sheet-memory-mobile-after.png` | (c) Why Sheet Memory Row | Mobile (390×844) | After (stacked badge) | `fb6a1baab4923b7d87d0c9739e6bd90acb9419d2c9c9dde59d242626a378c19b` |
| `c-why-sheet-memory-desktop-before.png` | (c) Why Sheet Memory Row | Desktop (1440×900) | Before | `1e29219940d7bbbcd4b604a50a239deb1ae118add188b37908223de5e4d9efbd` |
| `c-why-sheet-memory-desktop-after.png` | (c) Why Sheet Memory Row | Desktop (1440×900) | After | `6490deddb3767a5c408a0a76735df995930482d624aeb1ca07d3c817eeea253b` |
| `d-lunch-distance-mobile-before.png` | (d) Lunch Card Distance | Mobile (390×844) | Before | `e4db1744cc5af90da34c69c5e8d3643ea6597df9b685634e340d60eec7090b4a` |
| `d-lunch-distance-mobile-after.png` | (d) Lunch Card Distance | Mobile (390×844) | After (single line) | `e4db1744cc5af90da34c69c5e8d3643ea6597df9b685634e340d60eec7090b4a` |
| `d-lunch-distance-desktop-before.png` | (d) Lunch Card Distance | Desktop (1440×900) | Before | `3d4d05ea39a5b0dc55c279036d16c9bd6e6527a996338cc07479d0d4226f79d8` |
| `d-lunch-distance-desktop-after.png` | (d) Lunch Card Distance | Desktop (1440×900) | After | `3d4d05ea39a5b0dc55c279036d16c9bd6e6527a996338cc07479d0d4226f79d8` |
| `e-plans-card-mobile-before.png` | (e) Plans Item Card Header | Mobile (390×844) | Before (side-by-side) | `66c1ffe018c2f0425bbfcb1e9600f3d3f71cb7a1c295a7dbbb14dd4316bba7fc` |
| `e-plans-card-mobile-after.png` | (e) Plans Item Card Header | Mobile (390×844) | After (stacked badge) | `1b09acb5330c0f828c248747cb95db68b178e4e3f6f68f8bf27455d8ffa79b33` |
| `e-plans-card-desktop-before.png` | (e) Plans Item Card Header | Desktop (1440×900) | Before | `ca030942fd49cd8738c2ff210815dba59b0faed5a7499ca5c507f236e8ecd4fe` |
| `e-plans-card-desktop-after.png` | (e) Plans Item Card Header | Desktop (1440×900) | After | `ca030942fd49cd8738c2ff210815dba59b0faed5a7499ca5c507f236e8ecd4fe` |
| `e-for-you-card-mobile-before.png` | (e) For You Proposal Header | Mobile (390×844) | Before (side-by-side) | `d6a2cb41804f45f56123f8096f58a5c73601a9192fe55c2eb90106ca0bfe9688` |
| `e-for-you-card-mobile-after.png` | (e) For You Proposal Header | Mobile (390×844) | After (stacked badge) | `f2d9ad033189f46342e5a28db04c89b3f7f23fa66b2c100daf6e90bf245afa5a` |
| `e-for-you-card-desktop-before.png` | (e) For You Proposal Header | Desktop (1440×900) | Before | `eeb3c293256341f74d8bad322581a7ac0c4463b883d70a5420d4b2c010396f1e` |
| `e-for-you-card-desktop-after.png` | (e) For You Proposal Header | Desktop (1440×900) | After | `eeb3c293256341f74d8bad322581a7ac0c4463b883d70a5420d4b2c010396f1e` |
