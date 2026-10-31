# L2-ROUTE-MAP Evidence: Real Route/Map Routing Pipeline & Geometry

## Overview
This evidence bundle records verification for slice **L2-ROUTE-MAP** (TID: `INBOX-20261031-5B39CA`) under `docs/architecture/REV3_LIVE_ROADMAP.plan.md` §Slice L2.

> [!IMPORTANT] Acceptance Boundary Disclosure: Offline-Ready, NOT Live Done
> Per the explicit acceptance rule in REV3_LIVE_ROADMAP.plan.md §6: a map or route feature is **NOT** accepted as live done without independent e2e evidence on real provider responses, or it is explicitly reported as **blocked** on its owner gate (G-ROUTE).
> All tests and evidence recorded here run strictly offline against recorded provider response fixtures and loopback stubs.
> Therefore, this implementation represents **offline-ready** verification, not "live done".

---

## Architecture & Implementation Summary

1. **Routing Provider Port & Adapters**:
   - `RoutingProvider` port interface: `route(origin: Coordinate, destination: Coordinate, mode?: RouteMode) => Promise<RouteResult>`.
   - `OSRMRouteAdapter`: Server-side client consuming standard OSRM demo-server URL format (`https://router.project-osrm.org/route/v1/{mode}/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson`), decoding GeoJSON LineString coordinates and encoded polylines (precision 5 and precision 6).
   - `ORSRouteAdapter`: Compiles cleanly as a stub reading server-side `process.env.ORS_API_KEY` (never `VITE_`-prefixed). Verified via automated static check that `ORS_API_KEY` is never bundled into client JS assets.
   - `DestinationPort`: `LiveDestinationAdapter` returns `null` today (zero invented destinations in Live mode). Real destinations will connect in L3.

2. **Server Proxy Seam (`/api/route`)**:
   - Mounted in Vite dev and preview servers via `createRouteProxyMiddleware`.
   - Path-first routing: only intercepts `/api/route` and `/api/route/status` paths.
   - Strict loopback Host allowlist (`127.0.0.1`, `localhost`) rejecting non-loopback requests with HTTP 403.
   - Controlled by `ROUTE_LIVE_ENABLED` (boolean, default: `false`). When disabled, returns `{ enabled: false }` with zero outbound network calls.
   - `TILES_ENABLED` flag defaults strictly to `false` (no raster tiles loaded without owner authorization).

3. **No-Route Matrix**:
   Without a real destination, an authorized location, or a healthy provider response, Live mode renders an honest unavailable notice (`#notice-route-unavailable`) with its specific reason code:
   - `no_destination`: `"No route available · no destination set"`
   - `location_not_shared`: `"No route available · location not shared"`
   - `provider_disabled`: `"No route available · provider disabled"`
   - `provider_error`: `"No route available · provider error"`
   - `stale`: `"No route available · data is stale"`

4. **Geometry Rendering & Attribution**:
   - The map strip and route card decode the provider polyline coordinates and project them to SVG viewBox coordinates via Web Mercator projection.
   - Vertices and both endpoints fit cleanly inside the SVG bounds with padding, fully visible on both 390×844 and 1280×800 viewports.
   - Rendered polyline contains all 6 decoded fixture vertices (`#live-route-polyline`), not a straight 2-point line.
   - Mandatory attribution line present in every live route render:
     `Route © OSRM · data © OpenStreetMap contributors`
   - Demo route strictly maintains its schematic simulated map:
     `<span class="card-badge">Schematic · simulated</span>` with `data-provenance="fixture"`.

5. **External Handoff**:
   - An `"Open in Maps"` link built only from real origin and destination coordinates, labelled:
     `"Opens your maps app · not an in-app route"`
   - Never displayed without a real destination.
   - Complies with touch target ergonomic guidelines (>= 44×44px).

---

## Screenshot Matrix (6 States × 2 Viewports = 12 Artifacts)

| State | Mobile (390×844) | Desktop (1280×800) | Description |
|---|---|---|---|
| 01. Live No Destination | `live-no-destination-mobile.png`<br>`8d923c50…` | `live-no-destination-desktop.png`<br>`1613b7d4…` | Live empty home with no destination set ("No route available · no destination set"). |
| 02. Live Location Not Shared | `live-location-not-shared-mobile.png`<br>`87defe36…` | `live-location-not-shared-desktop.png`<br>`398ec13d…` | Destination present but location fix not granted ("No route available · location not shared"). |
| 03. Live Provider Disabled | `live-provider-disabled-mobile.png`<br>`1d1d4164…` | `live-provider-disabled-desktop.png`<br>`59bc99d0…` | Destination and location present, provider disabled ("No route available · provider disabled"). |
| 04. Live Provider Error | `live-provider-error-mobile.png`<br>`fc12f6b0…` | `live-provider-error-desktop.png`<br>`a9ec182d…` | Destination and location present, provider returns 500 ("No route available · provider error"). |
| 05. Live Route Recorded | `live-route-recorded-mobile.png`<br>`e8bcecce…` | `live-route-recorded-desktop.png`<br>`77aa4eca…` | Decoded multi-point polyline, ETA (6 min), distance (2.1 km), attribution, and Open in Maps handoff. |
| 06. Demo Schematic | `demo-schematic-mobile.png`<br>`fb686ab7…` | `demo-schematic-desktop.png`<br>`fd56378b…` | Demo mode map strictly preserved as schematic simulated fixture. |

---

## Invariant Verification

- `git diff f43c6c1d HEAD -- src/core`: Exactly 0 lines.
- Billed model calls: 0 (ledger untouched at 22/50).
- Network calls: 0 outbound external network calls in tests or runtime by default.
- Axe WCAG 2.1 AA: 0 critical, 0 serious violations.
- Touch target sizes: Minimum 44×44px on all interactive controls.
- Horizontal scroll: Zero horizontal overflow at 390px and 1280px widths.
