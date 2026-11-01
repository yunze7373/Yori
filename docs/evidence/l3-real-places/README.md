# L3-REAL-PLACES Evidence: Real Nearby Places & Overpass Seam Pipeline

## Overview
This evidence bundle records verification for slice **L3-REAL-PLACES** (TID: `INBOX-20261101-B92AC2`) under `docs/architecture/REV3_LIVE_ROADMAP.plan.json` §Slice L3.

> [!IMPORTANT] Acceptance Boundary Disclosure: Offline-Ready, NOT Live Done
> Per the explicit acceptance rule in REV3_LIVE_ROADMAP.plan.json: places and routing features are **NOT** accepted as live done without independent E2E evidence on real provider responses, or are explicitly reported as **blocked** on owner gates (G-ROUTE / G-LIVE-RUN).
> All tests and evidence recorded here run strictly offline against recorded provider response fixtures and loopback stubs.
> Therefore, this implementation represents **offline-ready** verification, not "live done".

---

## Architecture & Implementation Summary

1. **Overpass Proxy Seam (`/api/places`)**:
   - Path-first routing: only intercepts `/api/places` and `/api/places/status`.
   - Strict loopback Host allowlist (`127.0.0.1`, `localhost`) rejecting non-loopback requests with HTTP 403.
   - Origin/Referer header check rejecting unauthorized external cross-origin callers.
   - `PLACES_LIVE_ENABLED` default OFF (`{ enabled: false }`, zero outbound network calls).
   - Coordinates rounded to 3 decimals (~100m) for user privacy; raw coordinates never logged.
   - Amenity filter strictly allowlisted to `restaurant | cafe | fast_food`.
   - Fixed radius cap (≤1500m), 8s timeout with `AbortController`, descriptive User-Agent, and rate limiting (≥10s between outbound queries per server).
   - Browser never calls `overpass-api.de` directly. Verified via automated static check that production bundles contain zero references to `overpass-api.de`.

2. **Records to Cards**:
   - Each candidate carries `osmId`, `name` (from tags only), lat/lng, distance computed from user's fix, `fetchedAt`, and attribution `"OpenStreetMap via Overpass (ODbL)"`.
   - Optional fields (`cuisine`, `opening_hours`) appear only when present.
   - `"Open now"` chip shown only if `opening_hours` parses deterministically for current local time; otherwise omitted.
   - Zero star ratings, zero stock photos. Venues without a name record are never rendered.

3. **Deterministic & Explainable Ranking**:
   - Ranking computes distance and cuisine match against user's confirmed preferences (`activeLoadedFacts`).
   - Generates truthful explanations citing the confirmed memory fact or distance rule.
   - Zero model calls consumed (Muse Spark not invoked; lifetime model ledger strictly preserved at 22/50).

4. **Live UI States & Place-to-Route Linkage**:
   - `PLACES_LIVE_ENABLED` off: renders `"Nearby places · not enabled (owner setting)"`.
   - Enabled + no location: renders `"Share location to find nearby places"`.
   - Enabled + location + 0 results: renders honest empty state `"No dining options found nearby"`.
   - Provider error: renders unavailable notice `"Nearby places unavailable · provider error"`.
   - Selecting a place updates `DestinationPort` with OSM ID and destination coordinates. The route card displays `"Route to <name>"`. If route provider is enabled, it renders the real route polyline and ETA; if disabled, it renders `"No route available · provider disabled"`.
   - Demo mode stays fixture-labelled `Schematic · simulated`, and Demo and Live modes never blend.

5. **Carried P3 Invariants**:
   - Neutral Live right panel copy reads `"Nothing selected. Select a card to see details."` and never overclaims that real-time providers are ready when disabled.
   - Center Now-card map strip is strictly hidden when desktop right panel is present (`≥1024px`).

---

## Screenshot Matrix (6 States × 3 Widths = 18 Deliverables)

| File | Resolution | Description |
|---|---|---|
| `01-live-places-off-390.png` | 390×844 | Mobile Live Places Off: Honest notice indicating places provider is disabled by owner setting |
| `01-live-places-off-1280.png` | 1280×800 | Desktop Live Places Off: Three-zone shell with disabled places notice in right panel |
| `01-live-places-off-1440.png` | 1440×900 | Desktop Wide Live Places Off: 1440px viewport showing disabled status with neutral quiet shell |
| `02-live-places-no-location-390.png` | 390×844 | Mobile Live No Location: Prompt to share location before querying nearby dining |
| `02-live-places-no-location-1280.png` | 1280×800 | Desktop Live No Location: Right panel prompting for location fix without outbound query |
| `02-live-places-no-location-1440.png` | 1440×900 | Desktop Wide Live No Location: Wide layout prompting for location authorization |
| `03-live-places-results-390.png` | 390×844 | Mobile Live Results: 4 dining candidates rendered with distance, cuisine, and ODbL attribution |
| `03-live-places-results-1280.png` | 1280×800 | Desktop Live Results: Right panel candidate list rendered with deterministic ranking |
| `03-live-places-results-1440.png` | 1440×900 | Desktop Wide Live Results: Full 3-zone view with candidate cards and zero stock photos/ratings |
| `04-live-place-selected-route-390.png` | 390×844 | Mobile Place Selected: DestinationPort set to selected place, route card reading "Route to Civic Center Diner" |
| `04-live-place-selected-route-1280.png` | 1280×800 | Desktop Place Selected: Selected tile highlighting in right panel, route polyline rendered from OSRM |
| `04-live-place-selected-route-1440.png` | 1440×900 | Desktop Wide Place Selected: Integrated place selection with route ETA, distance, and attribution |
| `05-live-places-error-390.png` | 390×844 | Mobile Live Error: Honest unavailable notice on provider 500/timeout |
| `05-live-places-error-1280.png` | 1280×800 | Desktop Live Error: Right panel displaying provider error notice |
| `05-live-places-error-1440.png` | 1440×900 | Desktop Wide Live Error: Clean fallback state without broken UI or stale records |
| `06-demo-lunch-390.png` | 390×844 | Mobile Demo Lunch: Away-lunch scene clearly badged "Schematic · simulated" |
| `06-demo-lunch-1280.png` | 1280×800 | Desktop Demo Lunch: Away-lunch scene with simulated candidate options |
| `06-demo-lunch-1440.png` | 1440×900 | Desktop Wide Demo Lunch: Demo mode strictly separated from Live mode with zero cross-leakage |
