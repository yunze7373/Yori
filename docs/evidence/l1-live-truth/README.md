# L1-LIVE-TRUTH Evidence: Live Truthfulness, Honest Modules & Default Switch

## Overview
This evidence bundle records verification for slice **L1-LIVE-TRUTH** (TID: `INBOX-20261031-95154F`) under `docs/architecture/REV3_LIVE_ROADMAP.plan.md` §Slice L1 and `LIVING_CONTEXT_V2.md`.

Live mode is honest end to end:
1. **Provenance Tagging (`data-provenance`)**:
   - Every rendered data element on Home, Plans, For You, and the Sources view carries `data-provenance = live | fixture | user | none` (plus `data-source` and `data-fetched-at` for live data).
   - In Live mode, zero elements carry `data-provenance="fixture"`, and the page text is verified to contain no simulated fixture strings (`SIMULATED`, `Demo Place`, `Piano lesson`, `Team Sync`).
   - In Demo mode, every scene-derived element carries `data-provenance="fixture"` and is visibly labelled simulated.
2. **Honest Live Module States**:
   - **Now Card in Live**: Quiet/empty state (`.quiet-card.live-empty-card`, `data-provenance="none"`, `"Nothing needs your attention right now."`).
   - **Weather Module**:
     - Owner-gated: `"Live weather · not enabled (owner setting)"` (`data-provenance="none"`).
     - Live on stub: `"Weather for San Francisco · fixed demo city (not your location)"` (`data-provenance="live"`, `data-source="open-meteo"`, `data-fetched-at`).
     - Stale degradation: when `fetchedAt` is older than `validFor` (2h), degrades to `"Weather unavailable · data is stale"` (`data-provenance="none"`).
   - **Location Module**:
     - Prompt: `"Connect location"` (`data-provenance="none"`).
     - Denied: `"Location not shared · denied by user"` (`data-provenance="none"`).
     - Shared: `"Location shared · used for this session only"` (`data-provenance="live"`, `data-source="geolocation"`, `data-fetched-at`).
   - **Nearby Places Module**: `"Nearby places · not enabled (owner setting)"` (`data-provenance="none"`).
   - **Route Module**: `"No route available"` (`data-provenance="none"`).
   - **Plans Tab in Live**: Renders honest empty state (`.v2-empty-plans`, `data-provenance="none"`, `"No upcoming plans"`).
   - **For You Tab in Live**: Renders confirmed user memories only; when empty, renders `.v2-empty-proposals` (`data-provenance="none"`, `"No suggestions for you right now"`).
   - **Sources View in Live**: Lists runtime truth for Device clock (`live`), Weather, Location, Calendar (`none`), and Memory.
3. **Default-Mode Switch Built but Not Flipped**:
   - Production configuration `VITE_YORI_DEFAULT_MODE = demo | live`, defaulting to `'demo'` (behavior unchanged).
   - Query override supported via `?mode=live` / `?mode=demo` and `?default_mode=live`.
   - In Live mode without `?dev=1`, lands on honest empty Home with zero demo affordances (`#btn-dev-demo-controls` is omitted).
   - With `?dev=1`, reaches the Demo panel affordance.
4. **Geolocation Request Budget & Debounce Guard**:
   - `acquireSessionFix` enforces max 5 requests per session cap and 2000ms debounce.
   - Tested and verified with offline unit tests.

> [!NOTE] Offline Recorded Fixture Disclosure
> Per the constraints of L1, no live network calls were made to real providers (Open-Meteo, Overpass, OSRM, or model APIs). All test runs execute strictly against recorded response fixtures and deterministic browser mocks.

---

## Screenshot Matrix (10 States × 2 Viewports = 20 Artifacts)

| State | Mobile (390×844) | Desktop (1280×800) | Description |
|---|---|---|---|
| 01. Live Empty Home | `01-live-empty-home-mobile.png`<br>`79b8ac5f…` | `01-live-empty-home-desktop.png`<br>`ccfdc8ab…` | Honest quiet Now card in Live mode ("Nothing needs your attention right now."). |
| 02. Live Weather Owner-Gated | `02-live-weather-owner-gated-mobile.png`<br>`79b8ac5f…` | `02-live-weather-owner-gated-desktop.png`<br>`ccfdc8ab…` | Weather module showing owner-gated setting ("Live weather · not enabled (owner setting)"). |
| 03. Live Weather on Stub | `03-live-weather-on-stub-mobile.png`<br>`07ac6a35…` | `03-live-weather-on-stub-desktop.png`<br>`20bd1151…` | Live weather card with fixed demo city disclosure and live provenance. |
| 04. Live Location Denied | `04-live-location-denied-mobile.png`<br>`68d8e5f8…` | `04-live-location-denied-desktop.png`<br>`e8a75856…` | Location module reflecting explicit user denial ("Location not shared · denied by user"). |
| 05. Live Location Shared | `05-live-location-shared-mobile.png`<br>`c316fb30…` | `05-live-location-shared-desktop.png`<br>`542f680f…` | Location module with consented fix ("Location shared · used for this session only"). |
| 06. Live Places Not Enabled | `06-live-places-not-enabled-mobile.png`<br>`c316fb30…` | `06-live-places-not-enabled-desktop.png`<br>`542f680f…` | Nearby places module honest owner-gated state. |
| 07. Live Route Unavailable | `07-live-route-unavailable-mobile.png`<br>`c316fb30…` | `07-live-route-unavailable-desktop.png`<br>`542f680f…` | Route module honest unavailable state ("No route available"). |
| 08. Sources View Live | `08-sources-view-live-mobile.png`<br>`0d7e916a…` | `08-sources-view-live-desktop.png`<br>`d6c78b56…` | Modal Sources view in Live mode displaying truthful provenance of each active feed. |
| 09. Demo Labelled | `09-demo-labelled-mobile.png`<br>`9a761931…` | `09-demo-labelled-desktop.png`<br>`53875a45…` | Demo mode Home with visible SIMULATED badges and fixture provenance. |
| 10. Default Live Variant | `10-default-live-variant-mobile.png`<br>`07ac6a35…` | `10-default-live-variant-desktop.png`<br>`20bd1151…` | Production Live landing without `?dev=1`: empty Home with no demo affordance. |

---

## Architectural Compliance
- **Zero billed model calls**: Model live ledger untouched at 22/50 calls.
- **Zero core diff**: `git diff f43c6c1d HEAD -- src/core` produces exactly 0 lines.
- **Accessibility & Ergonomics**: Axe WCAG 2.1 AA passes with 0 critical or serious violations; touch targets meet or exceed 44×44px; zero horizontal overflow across mobile (390×844) and desktop (1280×800).
- **Default Switch Safety**: Default remains `'demo'`. Live default requires explicit owner acknowledgement of `SPEC_IMPACT_LIVE.md`.
