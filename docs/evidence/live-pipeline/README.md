# S1-LIVE-PIPELINE-CORE Verification Evidence

## Summary
Implementation and verification of `S1-LIVE-PIPELINE-CORE` (TID: `INBOX-20261102-F72383`).
Live mode now executes the real agent pipeline (`runPipeline`) over real environmental signals (`buildLiveSnapshot`) including:
- Real device clock (`RealSystemClock` / `new Date()`)
- Real consented one-shot location (`GeolocationAdapter` / `LocationPort`)
- Real weather status / conditions (gated by owner setting)
- Real nearby dining places (`places_lunch` from Overpass/OSM)
- Real local and external MemoryPort facts (confirmed facts only)

## Verification Highlights
1. **Differential Live-Change Flow**:
   - Initial honest gated quiet state: "Location Needed" / "Location permission needed to find nearby lunch places"
   - User grants location via `#btn-request-location`: zero user input drives perception directly to composer
   - Real Overpass dining candidates returned, composed into a Lunch plan with What-changed banner (`#what-changed-marker`)
2. **Hit-Test Matrix (elementFromPoint unoccluded)**:
   - Verified `#btn-accept`, `#btn-adjust`, `#btn-dismiss` unoccluded across:
     - 390×844 (Mobile)
     - 1024×768 (Tablet / Small Desktop)
     - 1280×800 (Desktop Standard)
     - 1440×900 (Large Desktop)
3. **Places-Off Honest Owner Gate**:
   - `/api/places` disabled returns truthful gated state ("Nearby places · not enabled (owner setting)")
4. **Suppression & Cross-Session Persistence**:
   - "Not now" (`#btn-dismiss`) suppresses lunch plan today and increments budget meter
   - Reloading the page retains suppression from storage envelope
5. **Failure Modes**:
   - Location denied displays honest "Location Access Denied"
   - Weather 504 error shows "Weather unavailable" in living context line, never falling back to "Clear"
6. **Provenance Gate**:
   - In Live mode without `?dev=1`, zero elements with `data-provenance="fixture"` and no simulated demo place copy ("Fiore Caffe", "Soba Place")
7. **Architectural Invariants**:
   - `git diff f43c6c1d HEAD -- src/core` = 0 lines
   - Billed model calls: 0 (locked at 22/50)

## Captured Screenshots
- `01-live-quiet-location-needed.png`: Honest gated quiet state before location grant
- `02-live-lunch-plan-composed.png`: Composed live lunch plan with What-changed banner and unoccluded action buttons
