# Evidence: REAL-MAP Implementation

**Task ID**: `[TID:INBOX-20261101-12065C]` [SRC:reviewer] 🟠 [P1] `REAL-MAP: replace the schematic route map with a real interactive map`  
**Governing Gate**: Preceded by `DESKTOP-PARITY-1` approval at commit `b51c581`. Authorized by Owner feedback (artifact `Nz2Vogz9JH3MMfw7SxpgZ8`, thread `bc18aec5`): *"这个我需要真实的地图。想办法实现。"*  
**Bridge Directives**:
1. `aa5d5c9f`: Strict OSM tile policy (standard Referer, cacheable tiles, Leaflet defaults, zero live calls before consent, fallback on 403 / abort).
2. `af886ec1`: Placement constraint from Owner 08:28 visual addendum (rich interactive Leaflet map placed in contextual expansion surfaces: expanded Trip Details view and desktop right-panel Trip Details; initial mobile Home retains compact $\le$ 140px schematic strip without pushing the plan down).
**Implementation Date**: 2026-11-02  

---

## 1. Executive Summary

This deliverable implements a real, interactive raster map built with bundled **Leaflet@1.9.4** and standard **OpenStreetMap** raster tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`).

Key technical highlights:
- **Disciplined Placement**: Follows the Owner's visual addendum:
  - Initial mobile Home retains the compact $\le$ 140px schematic map strip (`renderCompactMapStrip`), ensuring the plan headline and signal inputs remain prominent and unpushed.
  - Contextual expansion surfaces render the rich interactive Leaflet map: the expanded Trip Details view (`renderTripDetail` via `#btn-view-trip-details`) and the desktop right-panel Trip Details card (`renderDesktopRightPanel`).
- **Code-Splitting via Dynamic Import**: Leaflet is loaded dynamically via `import('leaflet')` to ensure zero SSR/Node issues in Vitest, isolating Leaflet into an independent 149.97 kB vendor chunk (`leaflet-src-*.js`, 43.48 kB gzip) while keeping the main JS bundle increase to just +8.26 kB (+1.65%).
- **Strict Network Sandbox**: Zero external network requests occur during tests or CI. E2E tests stub OpenStreetMap tiles locally via `page.route('**/tile.openstreetmap.org/**', ...)`, validated by a zero-request network guard.
- **Strict OSM Policy & Referer Preservation**: Standard `strict-origin-when-cross-origin` policy preserved with zero query parameters or cache-busting. Zero background prefetching.
- **Truthful Recorded Sample Geometry**: Uses `RECORDED_ROUTE_COORDINATES` from `tests/fixtures/route-fixtures.ts` for demo mode route polyline (`#route-drive`, `.v2-map-route`), with visible disclosure caption: `"Map © OpenStreetMap · route shape: recorded sample · simulated"`.
- **Accessible & Non-Hijacking**: Wheel zoom is disabled by default (`scrollWheelZoom: false`) to prevent hijacking page scrolling. Zoom is enabled strictly when focused or clicked, and automatically disabled on blur or `mouseleave`. Keyboard navigation and `prefers-reduced-motion` are fully respected. Axe AA reports 0 violations.
- **Dual Fallback on Network Error or 403 'Access Blocked'**: If tile loading fails (network abort, offline, or HTTP 403 'Access blocked by policy' as simulated in iframe sandboxes, timeout $\le$ 2800ms), gracefully transitions to the schematic SVG route map with an amber `"Map tiles unavailable · schematic shown"` banner within $\le$ 3s.
- **Dynamic Truthful Badging**: Card header badge dynamically reflects map status: `"Map © OSM · route simulated"` when real raster tiles are rendered, transitioning to `"Schematic · simulated"` in offline fallback or schematic mode.
- **Test Build Network Safety**: In `build:test`, `VITE_MAP_TILES=off` is enforced so that test runs and CI never fetch external tiles. Real tile rendering in `real-map.spec.ts` uses an explicit test-only opt-in hook (`window.__YORI_MAP_TILES__='osm'`) combined with local `page.route` tile stubbing. A dedicated `Global NetGuard` e2e test verifies zero non-loopback requests across the suite.
- **Live Mode Zero-Leak Consent Guard**: In Live mode (`/?ui=v2&mode=live`), exactly 0 OSM tile requests are initiated before explicit location consent is granted.

---

## 2. Deliverable Evidence Captures

| Capture File | Viewport | Scene / View | Description |
|:---|:---:|:---:|:---|
| [`real-map-clear-1280x800.png`](./real-map-clear-1280x800.png) | 1280x800 | Desktop Clear (Home) | Desktop view with compact schematic in center card and rich real Leaflet map with `"Map © OSM · route simulated"` in right-panel Trip Details. |
| [`real-map-clear-390x844.png`](./real-map-clear-390x844.png) | 390x844 | Mobile Clear (Trip Details) | Expanded Trip Details contextual view at 390x844 displaying rich real interactive map with tiles, polyline, and attribution. |
| [`real-map-rain-1280x800.png`](./real-map-rain-1280x800.png) | 1280x800 | Desktop Rain (Home) | Desktop right-panel Trip Details showing rain re-plan with floating `.v2-map-weather-callout` chip (`Rain forecast · simulated / Issued 1:35 PM`) positioned cleanly with fitBounds padding. |
| [`real-map-rain-390x844.png`](./real-map-rain-390x844.png) | 390x844 | Mobile Rain (Trip Details) | Mobile expanded Trip Details with floating weather callout chip overlay on real map. |
| [`real-map-fallback.png`](./real-map-fallback.png) | 1280x800 | Desktop Fallback (HTTP 403) | HTTP 403 'Access blocked' drill demonstrating graceful fallback to schematic SVG with `"Map tiles unavailable · schematic shown"` banner and `"Schematic · simulated"` badge. |

### SHA256 Checksums (`MANIFEST.sha256`)

```
c7d0e18f8e0bdaf8ff7c800b81ef0f1fc50c4574cd7f13ab788cba36a35ff2b7  real-map-clear-1280x800.png
8db8be63cbfb329c2b18acbabf3be36d0fcbd5d3942e5d18472801ba8d626dcf  real-map-clear-390x844.png
205ef0b57970bcceef464a31d6bbfd4b835b2e87840c5ce949dc4ff8fb372edb  real-map-fallback.png
dc25703f5f2fb0a5b44a1b6c7f04ce0746a5ed0302c8706cfa44978cf417d747  real-map-rain-1280x800.png
d4d758e6d79c85264081368ecb3ba176a236ba96becb2948fdf803307f02b9c9  real-map-rain-390x844.png
```

---

## 3. Bundle Size Delta Analysis

Comparison against baseline commit `b51c581`:

| Artifact | Baseline | REAL-MAP | Delta | Gzip Size | Notes |
|:---|:---:|:---:|:---:|:---:|:---|
| `main index.js` | 499.14 kB | 509.40 kB | **+10.26 kB** (+2.05%) | 114.45 kB | Shared real-map coordinator & glue logic |
| `leaflet vendor chunk` | *none* | 149.97 kB | **+149.97 kB** (new) | 43.48 kB | Code-split vendor chunk, loaded dynamically |
| `index.css` | 88.49 kB | 107.52 kB | **+19.03 kB** | 22.45 kB | Leaflet CSS (15 kB) + custom pins & map UI |

Total production JS downloaded on initial non-map views: 509.40 kB (only +10.26 kB over baseline). Leaflet vendor chunk is loaded only when a view rendering the map is active.

---

## 4. Verification Suite Results

- **Vitest Unit/Contract Tests**: 40/40 test files passed (915/915 tests).
- **Playwright E2E Tests**:
  - `tests/e2e/real-map.spec.ts`: 10/10 tests passed (including Global NetGuard and Strip DOM checks).
  - `tests/e2e/desktop-parity.spec.ts`: 18/18 tests passed.
  - `tests/e2e/video-script.spec.ts`: 4/4 tests passed.
  - `tests/e2e/closeout-truth-audit.spec.ts`: 34/34 tests passed.
  - `tests/e2e/s4-desktop-ia.spec.ts`: 18/18 tests passed.
  - `scripts/submission/check-video-script-sync.ts`: PASS (64/64 asserted UI strings).
  - `scripts/publish/privacy-scan.ts`: PASS (0 leaks).
- **Core Immutability**: `git diff --stat f43c6c1d HEAD -- src/core` = 0 lines (clean invariant).
- **Model Call Ledger**: 22/50 lifetime calls (0 billed calls dispatched during this task).
