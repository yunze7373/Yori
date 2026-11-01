# Evidence: REAL-MAP Implementation

**Task ID**: `[TID:INBOX-20261101-12065C]` [SRC:reviewer] 🟠 [P1] `REAL-MAP: replace the schematic route map with a real interactive map`  
**Governing Gate**: Preceded by `DESKTOP-PARITY-1` approval at commit `b51c581`. Authorized by Owner feedback (artifact `Nz2Vogz9JH3MMfw7SxpgZ8`, thread `bc18aec5`): *"这个我需要真实的地图。想办法实现。"*  
**Implementation Date**: 2026-11-02  

---

## 1. Executive Summary

This deliverable replaces the static schematic route SVG with a real, interactive raster map built with bundled **Leaflet@1.9.4** and standard **OpenStreetMap** raster tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`).

Key technical highlights:
- **Single Shared Component**: One shared real-map component (`src/ui/living-context/real-map.ts`) powers both the center Now card (mobile 390x844 and desktop 1280x800) and the desktop right-panel Trip Details card.
- **Code-Splitting via Dynamic Import**: Leaflet is loaded dynamically via `import('leaflet')` to ensure zero SSR/Node issues in Vitest, isolating Leaflet into an independent 149.97 kB vendor chunk (`leaflet-src-*.js`, 43.48 kB gzip) while keeping the main JS bundle increase to just +8.26 kB.
- **Strict Network Sandbox**: Zero external network requests occur during tests or CI. E2E tests stub OpenStreetMap tiles locally via `page.route('**/tile.openstreetmap.org/**', ...)`, validated by a zero-request network guard.
- **Truthful Recorded Sample Geometry**: Uses `RECORDED_ROUTE_COORDINATES` from `tests/fixtures/route-fixtures.ts` for demo mode route polyline (`#route-drive`, `.v2-map-route`), with visible disclosure caption: `"Map © OpenStreetMap · route shape: recorded sample · simulated"`.
- **Accessible & Non-Hijacking**: Wheel zoom is disabled by default (`scrollWheelZoom: false`) to prevent hijacking page scrolling. Zoom is enabled strictly when focused or clicked, and automatically disabled on blur or `mouseleave`. Keyboard navigation and `prefers-reduced-motion` are fully respected. Axe AA reports 0 violations.
- **Instant Fallback**: If tile loading fails (offline, CSP block, timeout $\le$ 2800ms), gracefully transitions to the schematic SVG route map with an amber `"Map tiles unavailable · schematic shown"` banner.

---

## 2. Deliverable Evidence Captures

The following screenshots capture the real interactive map across both viewports and weather conditions, plus the fallback drill:

| Capture File | Viewport | Scene | Description |
|:---|:---:|:---:|:---|
| [`real-map-clear-1280x800.png`](./real-map-clear-1280x800.png) | 1280x800 | Clear | Desktop view with center Now card real map and right-panel Trip Details real map rendered simultaneously with OSM raster tiles, polyline, markers, and attribution. |
| [`real-map-clear-390x844.png`](./real-map-clear-390x844.png) | 390x844 | Clear | Mobile viewport with real map strip inside Now card, zero horizontal overflow. |
| [`real-map-rain-1280x800.png`](./real-map-rain-1280x800.png) | 1280x800 | Rain | Desktop view showing rain re-plan with floating `.v2-map-weather-callout` chip (`Rain forecast · simulated / Issued 1:35 PM`) on map. |
| [`real-map-rain-390x844.png`](./real-map-rain-390x844.png) | 390x844 | Rain | Mobile view with weather callout chip overlay on compact real map. |
| [`real-map-fallback.png`](./real-map-fallback.png) | 1280x800 | Fallback | Aborted/failed tile drill demonstrating graceful fallback to schematic SVG with `"Map tiles unavailable · schematic shown"` banner. |

### SHA256 Checksums (`MANIFEST.sha256`)

```
11628a5c660367a3800c097081678415116622e96292b7b9ff24a79eb25c977e  real-map-clear-1280x800.png
f3b0d85d0dc243019eeb1f62728d5f0c5b1ad6809d3286dbb64a72a07e98cf8f  real-map-clear-390x844.png
e42992cd5ab5ed7c721df1d213c038558a237031b4b2b2414554fceef0fa2e90  real-map-fallback.png
ff5084007928e60dde058df0b8f44c1771b3ad20be12e4c12a8633444afa0e8b  real-map-rain-1280x800.png
f7509790cf0cf56aba52597ef398bd3306c64f8d7a7d2c6d8b042a80cebdeed6  real-map-rain-390x844.png
```

---

## 3. Bundle Size Delta Analysis

Comparison against baseline commit `b51c581`:

| Artifact | Baseline | REAL-MAP | Delta | Gzip Size | Notes |
|:---|:---:|:---:|:---:|:---:|:---|
| `main index.js` | 499.14 kB | 507.40 kB | **+8.26 kB** (+1.65%) | 114.13 kB | Shared real-map coordinator & glue logic |
| `leaflet vendor chunk` | *none* | 149.97 kB | **+149.97 kB** (new) | 43.48 kB | Code-split vendor chunk, loaded dynamically |
| `index.css` | 88.49 kB | 107.52 kB | **+19.03 kB** | 22.45 kB | Leaflet CSS (15 kB) + custom pins & map UI |

Total production JS downloaded on initial non-map views: 507.40 kB (only +8.26 kB over baseline). Leaflet vendor chunk is loaded only when a view rendering the map is active.

---

## 4. Verification Suite Results

- **Vitest Unit/Contract Tests**: 40/40 test files passed (915/915 tests).
- **Playwright E2E Tests**:
  - `tests/e2e/real-map.spec.ts`: 6/6 tests passed.
  - `tests/e2e/desktop-parity.spec.ts`: 18/18 tests passed.
- **Core Immutability**: `git diff --stat f43c6c1d HEAD -- src/core` = 0 lines (clean invariant).
- **Model Call Ledger**: 22/50 lifetime calls (0 billed calls dispatched during this task).
