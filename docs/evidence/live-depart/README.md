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
| 3 | `03-live-depart-rain-replan-390x844.png` | 390×844 (Mobile) | Live (Synthetic ICS + Nominatim + OSRM + Open-Meteo) | Live depart card for real calendar event "Product Review" at 3:00 PM. Event location resolved via Nominatim geocoder, driving route (15 min) and multimodal bus option (35 min) computed via OSRM, and current conditions via Open-Meteo proxy. Recomputes leave-by earlier (2:15 PM via bus with `bus_first` preference vs 2:35 PM clear drive) and surfaces the umbrella preparation checklist item ("Take umbrella"). |

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

## 4. Rework 1 Findings & Hardening

During review request `5985b0a1-2a8c-4691-a0a5-91b609bbce3d`, five specific findings were identified and resolved:

1. **Eliminated Fabricated Travel & Route Arithmetic (P1)**:
   - Removed 20/35-minute fallback travel estimates and synthetic `bus = drive + 15` arithmetic from `refreshLiveCalendar`.
   - When a route is unavailable (e.g. provider disabled), `liveTravelSignal` remains `null`.
   - Displays honest quiet state with headline `"Leave-by unavailable · no route (<reason>)"` and the real parsed event title/time, without fabricating leave-by minutes or emitting ungrounded `osrm`/`live` travel signals.

2. **Timezone Host-Independence & Windows TZID Mapping (P1)**:
   - Replaced host-dependent `new Date(toLocaleString(...))` parsing with iterative `Intl.DateTimeFormat.formatToParts` UTC offset conversion (`wallTimeToUtcIso`). Output is 100% identical on UTC, JST, or any host timezone.
   - Added canonical Windows-to-IANA timezone map (`WINDOWS_TO_IANA_TZ`) covering 45+ Windows zone names (e.g. `Tokyo Standard Time` → `Asia/Tokyo`, `Pacific Standard Time` → `America/Los_Angeles`).
   - `parseIcsDateTime` fails closed (returns `null`) on invalid or unresolvable TZIDs.
   - Replaced hardcoded `'UTC'` calendar signal timezone with device IANA timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`.

3. **Geocode Proxy Default-Disabled & Enforced Gate (P2)**:
   - `resolveGeocodeConfig`: Changed default to disabled (`GEOCODE_LIVE_ENABLED === 'true' || === '1'`).
   - Exposed truthful `/api/geocode/status` endpoint returning `{ enabled, provider: 'nominatim', attribution }`.
   - Middleware enforces fail-closed gate returning `{ enabled: false, success: false, error: 'owner_gated' }` when disabled, preventing any unapproved external calls.

4. **Dynamic Live Calendar Tile on Home (P2)**:
   - Dynamic calendar tile in `v2-home-view.ts` derives state from `liveCalendarStatus` and `liveCalendarSignal`.
   - When calendar drives the plan, the tile displays the upcoming event title/time (never hardcoded to `"Not connected"`). Only displays `"Not connected"` when unconfigured or disconnected.

5. **Connectors View Truthful Calendar Status (P2)**:
   - `connectors-view.ts` updated to dynamically format `#status-pill-calendar` based on `cal.state` and `formatPillLabel` (showing `'Connected'`, `'Owner setting'`, or `'Not available yet'`).

---

## 5. Rework 2 Findings & Hardening

During review request `fd304aa9-7175-41ec-b6a2-3d21dd2cc970`, four specific findings were addressed:

1. **First-Open Consent Gate Precedence (P1)**:
   - Lifted location prompt, denied, and unavailable consent evaluation to the top level of the quiet view compiler (`home-vm.ts`), preceding intent-specific checks.
   - Restored cold first-open behavior on default-Live `/`: shows `"Location Needed"` gated view and `"Use My Location"` action button without requiring pre-existing confirmed taste memory.

2. **True Clear vs. Rain Differential Verification (P2)**:
   - Updated differential E2E test in `live-depart.spec.ts` to run the same event under clear weather first (leave-by 2:35 PM, clear driving, no umbrella), then switch the weather mock to rain.
   - Configured `rain_transport_preference: 'bus_first'` with multimodal route duration (15 min drive, 35 min bus).
   - Asserted `leave-by(rain) < leave-by(clear)` (2:15 PM vs 2:35 PM), umbrella chip rendered exclusively under rain, and bus option ranked #1.

3. **Floating ICS Timezone Proxy Resolution (P2)**:
   - Floating timestamps (`YYYYMMDDTHHMMSS` without trailing `Z` and without `TZID` parameter) are resolved using `CALENDAR_DEFAULT_TZ` if configured in the environment, falling back to the server host's IANA timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), and finally defaulting to `'UTC'`.
   - Validated via `resolveIanaTimezone` in `server-proxy.ts` and passed into `IcsCalendarAdapter`.
   - Added unit test asserting floating `15:00` with `defaultTimezone: 'Asia/Tokyo'` resolves strictly to `06:00Z`.

4. **Dynamic No-Route Reason Labeling (P3)**:
   - In `home-vm.ts`, calendar quiet state maps the live routing failure reason via `NO_ROUTE_REASON_LABELS` (e.g. `provider disabled`, `provider error`, `no destination set`, `location not shared`).

---

## 6. Automated Verification Matrix

| Verification Tier | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | 0 errors |
| Core Invariant | `git diff f43c6c1d HEAD -- src/core` | 0 lines changed (`AC-EXT-1`) |
| ICS Calendar Unit Tests | `npx vitest run src/adapters/providers/ics-calendar-adapter.test.ts` | 8/8 passed (UTC & JST) |
| Nominatim Geocoder Unit Tests | `npx vitest run src/adapters/providers/nominatim-geocoder.test.ts` | 4/4 passed |
| Calendar Connector Port Unit Tests | `npx vitest run src/ui/connectors/ports/calendar-port.test.ts` | 6/6 passed |
| Trip Detail VM Unit Tests | `npx vitest run src/ui/view-models/trip-detail-vm.test.ts` | 5/5 passed |
| Desktop Panel Unit Tests | `npx vitest run src/ui/living-context/desktop-panel.test.ts` | 8/8 passed |
| Proxy Boundary Contract Tests | `npx vitest run tests/proxy-boundary/proxy-boundary.test.ts` | 22/22 passed |
| Golden Scenario Tests | `npm run test:golden` | 4/4 passed (18/18 tests) |
| System Drills | `npm run test:drills` | 7/7 passed |
| Production Build & Gating Checks | `npm run verify:production` | 0 violations |
| Live Depart E2E Suite (Dual Gate A+B & Intent) | `npx playwright test tests/e2e-live/live-depart.spec.ts` | 10/10 passed |
| Live Lunch E2E Regression | `npx playwright test tests/e2e-live/live-lunch.spec.ts` | 10/10 passed |
| Live Pipeline E2E Regression | `npx playwright test tests/e2e-live/live-pipeline.spec.ts` | 40/40 passed |
| Live Default Env Regression | `npx playwright test tests/env/live-default-env.spec.ts` | 24/24 passed |
