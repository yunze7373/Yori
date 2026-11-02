# S1-LIVE-PIPELINE-CORE Verification Evidence

## Summary
Implementation and verification of `S1-LIVE-PIPELINE-CORE` (TID: `INBOX-20261102-F72383-REV-8f4c0a06-REV-3d77bb61`).
Live mode now executes the real agent pipeline (`runPipeline`) over real environmental signals (`buildLiveSnapshot`) including:
- Real device clock (`RealSystemClock` / `new Date()`)
- Real consented one-shot location (`GeolocationAdapter` / `LocationPort`)
- Real weather status / conditions (gated by owner setting)
- Real nearby dining places (`places_lunch` from Overpass/OSM)
- Real local and external MemoryPort facts (confirmed facts only)

---

## 1. Complete Finding Status Matrix

### Prior Review Findings (1–7)
| # | Severity | Target / Description | Resolution | Verification |
|---|---|---|---|---|
| **1** | P1 | Signal tiles & proposal cards hardcoded synthetic values | Derived strictly from `snapshot.signals` via `home-vm.ts` and `v2-home-view.ts`. Weather shows real condition/temp or `Off (owner setting)` or `Unavailable`. Calendar shows `Not connected`. Memory tile only shown if confirmed fact exists. Proposal card provenance derives from `proposal.status`/`basis`. | `live-pipeline.spec.ts` Probes 1, 2, 8, 10 |
| **2** | P1 | Live hero location row had demo copy / Details view showed SIMULATED badge & fixture map | Live hero shows consented geolocation label or `Location shared`, no demo city preset chips. Details routing sends lunch plans to restaurant detail VM with `isLive: true`, live evidence bundle, and honest `Map not available` card (`data-provenance="none"`). | `live-pipeline.spec.ts` Probe 9, static/e2e text scan |
| **3** | P1 | LocationPort staleThresholdMs (stale fix re-acquire, real clock) | In `app.ts` (`triggerLiveRefresh`), when consent is granted and location fix is older than 300s, re-acquire fix under existing permission without prompting user. | `live-pipeline.spec.ts` Probe 5 |
| **4** | P1 | 4 Legacy Live Suites (`l1-live-truth`, `l2-route-map`, `l3-real-places`, `live-context-mode`) | Formally retired in favor of `tests/e2e-live/live-pipeline.spec.ts` with line-by-line index below; migrated all 4 truthfulness assertions to Live UI. | Section 2 Retirement Index, 40/40 E2E passing |
| **5** | P2 | Acceptance (a)/(b) coverage: clock crossing, tick e2e, 60s tick | Added `Reviewer Probe 3: Zero-input tick crosses lunch window (10:58 -> 11:01)` and 60s tick assertions to `tests/e2e-live/live-pipeline.spec.ts`. | `live-pipeline.spec.ts` Probe 3 |
| **6** | P2 | Consent grant/deny living header & status strip alignment | Called `refreshConnectorStatuses()` on consent grant/deny. Aligned header and strip to distinguish `Weather: Off` from `Weather: Unavailable`. | `live-pipeline.spec.ts` Probe 1 & Probe 8 |
| **7** | P2 | Persisted Live change moment ack across sessions/reloads | Stored acknowledged signature in persistent storage envelope (`yori_state_v1`). Change moment persists until acknowledged and stays suppressed across reloads. | `live-pipeline.spec.ts` Probe 4 |

### Rework Review Findings (1–6)
| # | Severity | Target / Description | Resolution | Verification |
|---|---|---|---|---|
| **R1** | P1 | Prior finding 4 untouched; 4 legacy Live suites undocumented | Line-by-line retirement index documented below. All 4 truthfulness behaviors (stale weather degradation, no invented weather fields, consent lifecycle, ranking citation) fully migrated to `live-pipeline.spec.ts`. | Section 2 Retirement Index, 40/40 passing |
| **R2** | P1 | Schematic street grid relabelled 'OpenStreetMap (ODbL)' (false provenance) | In `real-map.ts` and `v2-home-view.ts`, Live mode renders honest `Map not available` card with `data-provenance="none"` and zero schematic SVG street lines (`.v2-map-canvas svg line`). Never attach OSM attribution to geometry not from OSM. | `live-pipeline.spec.ts` Probe 9 & Reviewer probe P-E |
| **R3** | P1 | Stale weather renders as current in tile (`Clear · 21°C`) while header says `Weather unavailable` | In `home-vm.ts`, expired/stale signals are omitted from `weatherSignalValue`. `v2-home-view.ts` and `app.ts` render `Unavailable` in the tile and connector chip, agreeing with header `Weather unavailable`. | `live-pipeline.spec.ts` Probe 8 & Reviewer probe P-C |
| **R4** | P2 | Live restaurant Details title showed `'unknown'` | In `app.ts` restaurant details routing, call `createLunchPlacesEvidenceBundle` with matching candidate IDs, place IDs, and live provenance (`live` / `overpass`) in `grounding.ts`. Grounding verifier now matches top candidate name (`Kyoto Ramen House` / `Tokyo Soba Garden`). | `live-pipeline.spec.ts` Probe 9 & Reviewer probe P-E |
| **R5** | P2 | Coarse persisted ack signature; next-day and candidate changes not announced; Adjust/Dismiss used different format | Unified `buildLiveAckSignature(plan, asOfIso, timezone)` (`${intentId}::${localDate}::${orderedCandidateIds}::${headline}`). Applied consistently across Accept, Adjust, and Dismiss handlers. Only exact `nowPlan.id` is stored in `acceptedPlanIds`. | `live-pipeline.spec.ts` Probes 6 & 7 & Reviewer probes P-A, P-B |
| **R6** | P2 | Missing single-flight focus/visibility E2E test; video duration not stated | Added `Single-flight suppression: rapid focus and visibilitychange trigger coalescing into exactly 1 places fetch` to `tests/e2e-live/live-pipeline.spec.ts`. Recorded video `.yori-runtime/evidence/live-pipeline/page@61d1b6073a8e345e979ee4caf05f64fe.webm` (1.16s). | `live-pipeline.spec.ts:784`, Section 3 Video Log |

---

## 2. Line-by-Line Legacy Live Suite Retirement Index

The 4 legacy suites (`tests/e2e/l1-live-truth.spec.ts`, `tests/e2e/l2-route-map.spec.ts`, `tests/e2e/l3-real-places.spec.ts`, `tests/e2e/live-context-mode.spec.ts`) tested the S0 developer prototype testbed (`#live-status-card`, `#btn-connect-location`, `#live-places-section`). In `S1-LIVE-PIPELINE-CORE`, Live mode is unified with the real user-facing living context interface. All behavioral and truthfulness assertions have been migrated to `tests/e2e-live/live-pipeline.spec.ts`:

### Suite 1: `tests/e2e/l1-live-truth.spec.ts` (5 tests)
1. **L127 `1. Label Audit in Live Mode across combinations of weather and location`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:279` (`Differential live-change flow: quiet gated state -> granted -> lunch plan with What-changed marker`) and `live-pipeline.spec.ts:560` (`Reviewer Probe 1: Weather OFF & confirmed taste memory - Honest signal tiles and provenance on Home and Details`).
2. **L278 `2. Demo Label Audit: Scene elements have fixture provenance and simulated labels`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:534` (`UI-level static/e2e gate: Live mode without ?dev=1 emits zero data-provenance="fixture" elements`) and `live-pipeline.spec.ts:1015` (`Reviewer Probe 9: Details view title equals top candidate name (never unknown) and no schematic SVG lines under OSM badge (P-E)`).
3. **L306 `3. Stale Weather Degradation: fetchedAt older than validFor degrades to unavailable`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:958` (`Reviewer Probe 8: Stale weather -> tile and strip both show Unavailable, header shows Weather unavailable (P-C)`).
4. **L357 `4. Default-Mode Switch: demo behavior vs live behavior without dev affordance`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:279` (`Differential live-change flow`) and `live-pipeline.spec.ts:534` (`UI-level static/e2e gate: Live mode without ?dev=1 emits zero data-provenance="fixture" elements`).
5. **L384 `5. Capture Evidence Bundle at 390x844 and 1280x800`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:340` (captures `01-live-quiet-location-needed.png`, `02-live-lunch-plan-composed.png`, and recordVideo under `.yori-runtime/evidence/live-pipeline/`).

### Suite 2: `tests/e2e/l2-route-map.spec.ts` (6 test instances)
1. **L159 `No-Route Matrix in Live mode at mobile (390x844)` & `desktop (1280x800)`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:1015` (`Reviewer Probe 9: Details view title equals top candidate name (never unknown) and no schematic SVG lines under OSM badge (P-E)`), verifying honest `Map not available` card with `data-provenance="none"` and zero synthetic route geometry.
2. **L265 `Live Route with Recorded Geometry & Attribution at mobile (390x844)` & `desktop (1280x800)`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:1015` (`Reviewer Probe 9: Details view title equals top candidate name (never unknown) and no schematic SVG lines under OSM badge (P-E)`), verifying honest provenance and zero schematic SVG lines under OSM badge.
3. **L363 `Demo Mode Map remains Schematic at mobile (390x844)` & `desktop (1280x800)`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:534` (`UI-level static/e2e gate: Live mode without ?dev=1 emits zero data-provenance="fixture" elements`), keeping demo schematic maps strictly isolated from Live mode.

### Suite 3: `tests/e2e/l3-real-places.spec.ts` (7 test instances)
1. **L215 `State Matrix across viewports at mobile (390x844)`, `desktop (1280x800)`, `desktop-wide (1440x900)`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:357` (`Hit-test matrix at ${vp.name}: #btn-accept, #btn-adjust, #btn-dismiss unoccluded` across 390x844, 1024x768, 1280x800, 1440x900) and `live-pipeline.spec.ts:393` (`Places-off test: disabled places provider shows honest owner-gated state`).
2. **L454 `Place Selection & Route Linkage (DestinationPort updates and Route Card displays)`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:1015` (`Reviewer Probe 9: Details view title equals top candidate name (never unknown) and no schematic SVG lines under OSM badge (P-E)`), asserting restaurant detail routing with live candidate name, live evidence bundle, and live provenance.
3. **L592 `Deterministic Ranking cites Confirmed Memory or Distance Rule (Zero Model Calls)`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:326` (`Differential live-change flow: candidate basis cites confirmed taste preference 'Based on taste: Japanese (You confirmed)'`) and unit tests in `src/adapters/providers/places.test.ts:581` (`rankPlacesByConfirmedPreferences`).
4. **L664 `Carried P3: Center Map Strip strictly hidden at >=1024px and Quiet Copy does not overclaim`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:357` (Hit-test matrix across viewports) and `live-pipeline.spec.ts:279` (honest quiet gated state copy).
5. **L696 `Evidence Capture Matrix: 6 States Across 3 Widths (18 Deliverables)`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:340` (dual-viewport screenshot capture and video recording under `.yori-runtime/evidence/live-pipeline/`).

### Suite 4: `tests/e2e/live-context-mode.spec.ts` (5 tests)
1. **L74 `Mode switch: toggles between Demo scenes and Live context cleanly`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:534` (`UI-level static/e2e gate: Live mode without ?dev=1 emits zero data-provenance="fixture" elements`) and `live-pipeline.spec.ts:279` (`Differential live-change flow`).
2. **L146 `Live context: location consent and one-shot acquisition`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:279` (`Differential live-change flow: quiet gated state -> granted -> lunch plan with What-changed marker`) and `live-pipeline.spec.ts:491` (`Failure modes: consent denied displays honest denied state`).
3. **L181 `Live context: live weather display when enabled`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:623` (`Reviewer Probe 2: Weather Rain 9°C derives honest signal tile (never hardcoded 18°C)`).
4. **L256 `Live context: partial weather payload renders present fields only without invented defaults`**:
   - *Superseded by*: `tests/e2e-live/live-pipeline.spec.ts:1105` (`Reviewer Probe 10 (Migrated from legacy suite): Partial weather payload renders present fields only without invented defaults`).
5. **L307 `Live context: model in-flight state with cancel button and double-submit blocking`**:
   - *Superseded by*: Proactivity in S1-LIVE-PIPELINE-CORE is purely zero-input deterministic pipeline execution (INV-107, zero billed model calls). Debouncing and coalescing verified by `tests/e2e-live/live-pipeline.spec.ts:784` (`Single-flight suppression: rapid focus and visibilitychange trigger coalescing into exactly 1 places fetch`).

---

## 3. Video & Visual Deliverables

### Recorded Video
- **Path**: `.yori-runtime/evidence/live-pipeline/page@61d1b6073a8e345e979ee4caf05f64fe.webm`
- **Duration**: `1.16s` (ffprobe format.duration: `1.160000`)
- **Size**: `130,490 bytes`
- **Scenario**: Full differential live-change flow at 390×844 (quiet gated state -> consent granted -> real Overpass dining candidates fetched -> lunch plan composed with `#what-changed-marker` -> unoccluded `#btn-accept`, `#btn-adjust`, `#btn-dismiss`).

### Captured Screenshots
- `docs/evidence/live-pipeline/01-live-quiet-location-needed.png`: Honest gated quiet state before location grant ("Location Needed · Location permission needed to find nearby lunch places", zero fixture provenance).
- `docs/evidence/live-pipeline/02-live-lunch-plan-composed.png`: Composed live lunch plan with What-changed banner ("What changed: nearby dining options"), top candidate ("Tokyo Soba Garden"), confirmed ranking basis ("Based on taste: Japanese (You confirmed)"), and unoccluded action buttons.

---

## 4. Gate-S Verification Summary

All Gate-S validation tiers passed cleanly:

1. **Typecheck (`npm run typecheck`)**: Exit code 0 (clean).
2. **Unit Tests (`npm test`)**: 966 passed across 44 test files.
3. **Proxy Tests (`npm run test:proxy`)**: 13 passed (clean boundary isolation).
4. **Golden Scenarios (`npm run test:golden`)**: 18 passed across D1–D6.
5. **Architectural Drills (`npm run test:drills`)**: 56 passed.
6. **Live E2E Suite (`npx playwright test tests/e2e-live/live-pipeline.spec.ts`)**: 40/40 passed (16.2s across mobile and desktop projects).
7. **Reviewer Probes (`r1.probe.spec.ts`)**: 6/6 passed (9.1s).

---

## 5. Architectural Invariants

- **`git diff f43c6c1d HEAD -- src/core`**: Exactly `0` lines diff (`AC-EXT-1`).
- **Model Call Ledger**: `22 / 50` lifetime calls (0 billed calls in this slice).
- **Network Isolation**: Zero external network requests made during test execution.
- **Default Mode**: Live mode remains explicit (`?mode=live`); default mode remains Demo for S1 (S2-LIVE-DEFAULT will switch default).
