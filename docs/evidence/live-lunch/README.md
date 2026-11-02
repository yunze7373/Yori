# Evidence Index: S3-LIVE-LUNCH (PT:S3-LIVE-LUNCH / TID: INBOX-20261102-C7C922)

**Slice:** `S3-LIVE-LUNCH` (Narrative B: consented location → Overpass candidates with open-now → OSRM walking ETA)  
**Parent Plan:** `docs/architecture/LIVE_FIRST.plan.json` (Rev 2)  
**Task ID:** `INBOX-20261102-C7C922`  
**Core Invariant:** `git diff f43c6c1d HEAD -- src/core` = 0 lines  
**Owner Gates:** (b) Overpass instance OK, (a) OSRM demo limits OK. `PLACES_LIVE_ENABLED=false` and `ROUTE_LIVE_ENABLED=false` by default; 100% of automated tests execute against recorded responses or deterministic mocks. Zero live network calls during tests or CI.

---

## 1. Visual Proof Index

| # | Artifact | Viewport | Provenance | Description |
|---|---|---|---|---|
| 1 | `01-live-lunch-390x844.png` | 390×844 (Mobile) | Live (Overpass + Local Memory) | Live lunch recommendation card with top candidate `Hayes Valley Ramen` (450m) scrolled into view, showing confirmed taste citation, `Open now` status chip derived from `opening_hours` (`Mo-Su 11:00-22:00`), ODbL attribution (`OpenStreetMap via Overpass (ODbL)`), and action buttons. Zero fixture elements. |
| 2 | `02-live-lunch-1280x800.png` | 1280×800 (Desktop) | Live (Overpass + OSRM) | Desktop candidate list with real Overpass tiles. Candidate tiles display `Open now` for venues with verified opening hours, and `Hours unknown` for venues without parseable tags (`Mission Taqueria`). Selecting a candidate triggers `/api/route` with `mode=walking`, rendering Live Route card with walking ETA (`6 min`), walking distance (`450 m`), and OSRM attribution. |

---

## 2. Intent Triggering Mechanics (Perception to Action)

The Live Lunch intent triggers automatically through the perception pipeline when the following environmental conditions converge:

1. **Clock Window (11:00 – 14:30)**:
   - Evaluated locally against the snapshot timezone via `isWithinLunchWindow(snapshot.asOf, timezone)`.
   - Before 11:00 or after 14:30, `LunchDetector.detect` returns `null`.

2. **Consented Location Fix (`location_status`)**:
   - Location must be granted (`status === 'available'` or `'granted'`) with valid coordinates `[lat, lng]` and `isHome !== true`.
   - When location permission is needed (`prompt`), the app renders an honest gated quiet state ("Location Needed") with `#btn-request-location`.
   - When location permission is denied (`denied`), the app renders an honest notice ("Location Access Denied" / "Share location to find nearby places").

3. **Confirmed Taste Memory Facts (`taste_preference` / `favorite_cuisine`)**:
   - `LunchPreparer.prepare` checks for confirmed taste memory facts in `MemoryFact[]`.
   - **Cold User Fail-Closed**: If the user has zero confirmed taste facts, `LunchPreparer.prepare` returns `null`. The system fails closed to a calm, neutral quiet state ("Nothing needs your attention right now.") rather than presenting ungrounded recommendations.
   - When confirmed taste facts exist (e.g. `Japanese or Ramen`), places matching the confirmed taste tokens are boosted ahead of closer places, with explicit citation: `"Matches your confirmed taste for Ramen"`. If no places match, ranking falls back to the deterministic distance rule: `"Closest dining option (250m)"`.

---

## 3. Provider Data & Provenance Invariants

1. **Real Candidate Fields**:
   - Candidate IDs (`placeId: 'overpass-node-<id>'`), OSM IDs (`osmId`), coordinates (`lat`, `lng`), and `fetchedAt` timestamps come strictly from provider records (`parseOverpassElements`).
   - Venues lacking a name tag in provider records are dropped.

2. **Opening Hours Derivation**:
   - Derived deterministically by `parseDeterministicOpeningHours` solely from `opening_hours` tags.
   - Evaluated for local day-of-week and time.
   - When `opening_hours` tag is missing, complex, or unparseable, the status returns `undefined` and the UI explicitly renders `Hours unknown`. Estimations, guesses, or assumed business hours are strictly prohibited.

3. **Routing Mode, Foot Endpoint Policy, & Walking ETA**:
   - When a lunch candidate or dining destination is selected, `refreshLiveRoute` in `app.ts` dynamically sets `mode=walking`.
   - **Foot-Capable Endpoint Under Gate (a)**: Under owner gate (a), walking routing uses the dedicated foot-profile OSRM base URL `OSRM_FOOT_BASE_URL` (documented default: `https://routing.openstreetmap.de/routed-foot` operated by FOSSGIS e.V. under fair-use policy: attribution required, no heavy automated usage). The public OSRM demo host (`https://router.project-osrm.org`) is built exclusively with the car profile and is never queried for walking routes.
   - **Fail-Closed on Unconfigured Foot Base**: When `OSRM_FOOT_BASE_URL` is unconfigured (`null`), walking routing fails closed with reason `mode_unsupported`, and the desktop route card truthfully displays `"Walking time unavailable · straight-line <distance>"` with zero minutes.
   - When a foot route is available, walking ETA and distance are computed directly from provider route geometry legs (`durationS` and `distanceM`).
   - OSRM and OpenStreetMap attribution (`Route © OSRM · data © OpenStreetMap contributors`) is displayed in the route card footer.

4. **Zero Ratings & Zero Remote Photos**:
   - Restaurant detail VM and candidate tiles contain zero star ratings, review counts, or pricing estimates.
   - Hero art uses local labelled SVG illustrations (`getLocalIllustration`) with zero external image requests.

5. **Tick Acceptance Stability (`BACKLOG-20261102-S1CORE-P3(e)`)**:
   - In `app.ts`, `isPlanAccepted` ensures that lunch plans (whose IDs contain the UTC `asOf` timestamp `plan-lunch-YYYYMMDD...`) remain accepted across 60-second ticks within the same UTC calendar date (`YYYYMMDD`).
   - When crossing into the next UTC calendar day, the prior acceptance cleanly expires and unaccepts.

---

## 4. Automated Verification Matrix

| Verification Tier | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | 0 errors |
| Core Invariant | `git diff f43c6c1d HEAD -- src/core` | 0 lines changed (`AC-EXT-1`) |
| Adapter Unit Tests | `npx vitest run src/adapters/providers/overpass-places-adapter.test.ts src/adapters/providers/osrm-route-adapter.test.ts` | 8/8 passed |
| Detail VM Unit Tests | `npx vitest run src/ui/view-models/restaurant-detail-vm.test.ts` | 7/7 passed |
| Places & Routing Unit Tests | `npx vitest run src/adapters/providers/places.test.ts src/adapters/providers/routing.test.ts` | 39/39 passed |
| Full Unit Suite | `npm test` | 1947/1947 passed |
| Proxy Boundary Tests | `npm run test:proxy` | All passed |
| Production Gating Checks | `npm run verify:production` | 0 violations |
| Live Pipeline E2E | `npx playwright test tests/e2e-live/live-pipeline.spec.ts` | 40/40 passed (20 mobile + 20 desktop) |
| Live Lunch Dual Gate A+B | `npx playwright test tests/e2e-live/live-lunch.spec.ts` | 10/10 passed (5 mobile + 5 desktop) |
| Env Tests | `npx playwright test tests/env/live-default-env.spec.ts` | 24/24 passed (12 mobile + 12 desktop) |
