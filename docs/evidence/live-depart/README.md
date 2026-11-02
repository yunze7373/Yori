# Evidence Index: S4-LIVE-DEPART (PT:S4-LIVE-DEPART / TID: INBOX-20261102-6C6D0B)

**Slice:** `S4-LIVE-DEPART` (Narrative A: read-only ICS calendar port + Nominatim geocode → OSRM ETA + Open-Meteo at the target time)  
**Parent Plan:** `docs/architecture/LIVE_FIRST.plan.json` (Rev 2)  
**Task ID:** `INBOX-20261102-6C6D0B`  
**Core Invariant:** `git diff f43c6c1d HEAD -- src/core` = 0 lines (`AC-EXT-1`)  
**BLOCKED-Accepted Owner Gate (Plan §9b):**
- Agents never read, print, or paste the calendar secret iCal URL in chat or commits.
- Proxy boundary endpoint `/api/calendar/status` returns a truthful boolean (`configured: boolean, enabled: boolean`) without exposing the URL.
- When unconfigured (`CALENDAR_ICS_URL` unset), the app ships the truthful connection-block state naming the owner action (`paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat`).
- Zero real Nominatim/OSRM/Open-Meteo network calls in tests; provider flags stay disabled by default (`CALENDAR_LIVE_ENABLED=false`, `GEOCODE_LIVE_ENABLED=false`).

---

## 1. Visual Proof Index

| # | Artifact | Viewport | Provenance | Description |
|---|---|---|---|---|
| 1 | `01-live-depart-connection-block-390x844.png` | 390×844 (Mobile) | Live (Unconfigured / Connection-Block) | Mobile Home quiet state ("Nothing needs your attention right now") and Settings > Connectors showing Calendar status as `Not available yet` with zero toggle affordances and zero fake events. No simulated fixtures or ungrounded piano lessons. |
| 2 | `02-live-depart-connection-block-1280x800.png` | 1280×800 (Desktop) | Live (Unconfigured / Connection-Block) | Desktop quiet state rendering `#desktop-notice-calendar-unconfigured-quiet` in the right panel naming the owner action: `"Calendar · Owner Source Needed: paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat"` with `data-provenance="none"`. |
| 3 | `03-live-depart-rain-replan-390x844.png` | 390×844 (Mobile) | Live (Synthetic ICS + Nominatim + OSRM + Open-Meteo) | Live depart card for real calendar event "Product Review" at 3:00 PM. Event location resolved via Nominatim geocoder, driving route and 15 min travel time computed via OSRM, and target-time rain detected via Open-Meteo. Recomputes leave-by earlier (2:35 PM) and surfaces the umbrella preparation checklist item ("Take umbrella"). |

---

## 2. Intent Triggering Mechanics (Perception to Action)

The Live Depart intent recomputes departure logistics from real temporal and environmental signals:

1. **Read-Only ICS Calendar Source**:
   - The calendar adapter fetches the owner's iCal URL exclusively via the server-side proxy middleware (`/api/calendar`), completely hiding the private feed URL from client code and browser network logs.
   - The RFC 5545 parser (`ics-calendar-adapter.ts`) handles line unfolding, timezone offsets, cancellation status (`STATUS:CANCELLED`), and recurrence rules (`RRULE:FREQ=...`) to produce structured `CalendarEvent` objects.
   - If no calendar URL is configured, `/api/calendar/status` truthfully returns `configured: false`, and no events are fabricated.

2. **Nominatim Geocoding**:
   - Event locations are geocoded via `/api/geocode` backed by Nominatim.
   - The geocoder enforces a strict rate limit (1 request per second max), in-memory query caching, attribution (`Data © OpenStreetMap contributors, ODbL 1.0`), and a dedicated User-Agent.

3. **OSRM Route & Travel Time Calculation**:
   - Origin (user device location) and destination (geocoded event coordinates) are routed via `/api/route`.
   - Driving mode uses the standard OSRM demo base URL; walking mode uses the foot-capable base URL (`OSRM_FOOT_BASE_URL`), or returns `mode_unsupported` if unavailable.
   - Travel duration and distance are extracted from provider geometry legs.

4. **Target-Time Open-Meteo Weather & Rain Re-Plan**:
   - Open-Meteo weather forecasts are evaluated for the target departure window.
   - Precipitation / rain condition triggers the weather condition rule:
     - Prompts umbrella preparation in the checklist ("Take umbrella").
     - Recomputes leave-by time incorporating buffer minutes and rain transport preferences.
     - Adjusts recommended departure time earlier (e.g. 2:35 PM for a 3:00 PM event with 15 min drive + 10 min prep buffer).

---

## 3. Security Boundary & Privacy Invariants

1. **Secret URL Never Client-Exposed**:
   - `CALENDAR_ICS_URL` is parsed exclusively in `server-proxy.ts` on the Node server.
   - The proxy status endpoint `/api/calendar/status` returns only `{ configured: boolean, enabled: boolean, provider: 'ics', attribution: string }`.
   - The private URL string is absent from client bundles, build artifacts, and client network responses.

2. **Zero Log Leaks**:
   - Server-side logging sanitizes URLs and never logs query parameters or private paths of calendar feeds.

3. **Zero Fake Events (Strict Live Integrity)**:
   - When calendar is unconfigured or returns empty, the app remains in an honest quiet state.
   - The app never falls back to hardcoded demo events (e.g. `Piano lesson`) in Live mode.

---

## 4. Automated Verification Matrix

| Verification Tier | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | 0 errors |
| Core Invariant | `git diff f43c6c1d HEAD -- src/core` | 0 lines changed (`AC-EXT-1`) |
| ICS Calendar Unit Tests | `npx vitest run src/adapters/providers/ics-calendar-adapter.test.ts` | 6/6 passed |
| Nominatim Geocoder Unit Tests | `npx vitest run src/adapters/providers/nominatim-geocoder.test.ts` | 4/4 passed |
| Calendar Connector Port Unit Tests | `npx vitest run src/ui/connectors/ports/calendar-port.test.ts` | 6/6 passed |
| Trip Detail VM Unit Tests | `npx vitest run src/ui/view-models/trip-detail-vm.test.ts` | 5/5 passed |
| Desktop Panel Unit Tests | `npx vitest run src/ui/living-context/desktop-panel.test.ts` | 8/8 passed |
| Proxy Boundary Contract Tests | `npx vitest run tests/proxy-boundary/proxy-boundary.test.ts` | 20/20 passed |
| Full Unit Suite | `npm test` | 1968/1968 passed |
| Golden Scenario Tests | `npm run test:golden` | 4/4 passed (18/18 tests) |
| System Drills | `npm run test:drills` | 7/7 passed |
| Production Build & Gating Checks | `npm run verify:production` | 0 violations |
| Live Depart E2E Suite (Dual Gate A+B & Intent) | `npx playwright test tests/e2e-live/live-depart.spec.ts` | 6/6 passed |
| Live Lunch E2E Regression | `npx playwright test tests/e2e-live/live-lunch.spec.ts` | 10/10 passed |
| Live Pipeline E2E Regression | `npx playwright test tests/e2e-live/live-pipeline.spec.ts` | 40/40 passed |
| Live Default Env Regression | `npx playwright test tests/env/live-default-env.spec.ts` | 24/24 passed |
