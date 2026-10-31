# Rev3 Delta Roadmap — Live Map, Places, Desktop IA (Owner Hard Acceptance Update)

> Narrow delta for ARCH-REV3-LIVE-MAP-PLACES-DESKTOP (owner
> msg_6147854c, 2026-11-01 JST): mobile must look mobile, desktop
> must look desktop, and every dynamic module in Live must be real —
> real map geometry for navigation, real nearby restaurants,
> premium visual quality. This roadmap maps that direction onto the
> existing Rev3 plans without reopening them: S1
> (UI-HOME-QUIET) is **not** expanded and **not** marked failed for
> lacking future owner-gated live services; S2/S3 keep their
> approved scopes; the gate sequence S1 → S2 → S3 stands. Executable
> ledger: `REV3_LIVE_ROADMAP.plan.json`. The owner's mockup
> (`yori_proactive_life_assistant_mockup.png`, sha256 `ef4cf701…`)
> is not on this Mac; per-viewport visual review against it is by
> the owner/Reviewer, and no pixel parity is claimed here.

## 1. Live truthfulness model (applies to every slice)

- **Live** renders only verified inputs, each with source +
  timestamp. Live **never** shows fixture data. Without a source,
  Live shows a truthful `empty`, `unavailable`, or
  `permission-needed` state (the §Connectors states, reused).
- **Demo** fixtures are prominently labelled `SIMULATED` and are
  reachable only behind `?dev=1` (production default is Live with
  honest empty states, not a silent fixture fallback).
- Every dynamic module names its provider and `fetchedAt`; stale
  data degrades to `unavailable`, never quietly persists.

## 2. Distinct mobile vs desktop IA (requirement 1)

Shared state and semantic components; different composition:

| | Mobile 390×844 | Desktop 1280×800 |
|---|---|---|
| Priority | One priority action (NOW), sheets for detail | Purpose-built multi-column layout |
| Map | Strip/sheet region sized by information value | Proportionate map region beside a detail sidebar |
| Ask | Safe-area docked composer | Composer with expanded conversation overlay |
| Nav | Home / Plans / For You / Me + ask bar | Same destinations, desktop chrome |

**Placement decision:** this lands as a **new slice S4-DESKTOP-IA
after S3** (S3 keeps mobile-first microinteractions). S1 and S2 are
not expanded. Components stay semantic (same view-models, two
compositions), so state and tests are shared.

## 3. Real route/map (requirement 3)

A live navigation suggestion requires: real destination,
authorized location, a routing provider's **geometry + ETA**,
timestamp/source, and a refresh path. The map strip draws the
**actual route geometry** (decoded polyline), never a schematic.
Without all of these, Live shows "no route available"; the Demo
route stays `SIMULATED` behind `?dev=1`. An external-map handoff
link is allowed when honestly labelled as a handoff.

| Provider | Key/cost | Terms to respect | Verdict |
|---|---|---|---|
| OSRM public demo server | None | Fair-use demo endpoint, no SLA, no bulk/commercial reliance; attribution | Dev/recorded fixtures + first live evidence if the owner accepts demo-server limits (G-ROUTE) |
| OpenRouteService | Free-tier API key (owner-registered) | Key server-side; quota caps | **Recommended live default** if the owner registers a key |
| Mapbox / Google Routes | Billed accounts | Billing + key custody server-side | Owner-gated alternative only (G-BILL) |
| Map tiles | — | OSM tile usage policy: attribution required, no bulk/heavy use, cache honestly; prefer a tile provider with explicit terms for anything beyond demo | Attribution line mandatory in every map render |

Offline work (no gate): `RoutingProvider` port + adapters wired
behind it, recorded-response geometry fixtures, actual-polyline
rendering, refresh/staleness, "no route available" Live state.

## 4. Real nearby restaurants (requirement 4)

From a real places provider only: verified place ID, geolocation,
`fetchedAt`; open-now/rating/ETA shown **only when the provider
supplies them fresh**. Ranking: bounded Muse Spark decisions
(Rev4 rules) plus XMemo confirmed memory when authorized
(deterministic fallback otherwise). No stock photos, no invented
venues — a venue without provider evidence does not render.

| Path | Cost/key | Terms | Verdict |
|---|---|---|---|
| Overpass / OSM (already in repo: `overpass-places-adapter.ts`) | Free, no key | ODbL attribution; fair-use rate limits; coordinates disclosed (P-LOC lineage) | **First live path**, behind the existing owner gates |
| Google Places (New) | Billed key | Server-side key only; field-masked requests | Owner-gated alternative (P-BILL) if quality demands |

## 5. Premium visual quality (requirement 5)

Per-viewport review against the owner's mockup (sha256
`ef4cf701…`) at 390×844 and 1280×800: composition, hierarchy,
map proportion, and finish. This roadmap defines the acceptance
(the reviewer/owner compares against the mockup); the Architect
cannot see the mockup and claims no parity.

## 6. Ordered slices

Offline first (adapter wiring, recorded fixtures, truthful empty
states, desktop IA), owner-gated after. Full detail, files, and
checks: `REV3_LIVE_ROADMAP.plan.json`.

| Slice | Content | Gate |
|---|---|---|
| L1 | Live truthfulness wiring: ports, recorded fixtures, Live empty/unavailable/permission-needed states, Demo behind `?dev=1` | none (offline) |
| L2 | Real route/map: routing port + adapters, actual geometry, tiles+attribution, refresh, no-route state | none (offline, recorded responses) |
| S4-DESKTOP-IA | Desktop purpose-built IA + per-viewport premium pass (after S3) | none (offline) |
| L3 | Real nearby places on the provider seam (recorded + deterministic tests) | none (offline) |
| G-ROUTE | Owner: routing provider choice (OSRM demo limits vs ORS key), cost cap, ToS acceptance | **owner** |
| G-LIVE-RUN | Owner-gated real-run: authorized location + live providers, independent e2e on REAL provider evidence | **owner** |

**Acceptance rule (explicit):** a map or restaurant feature is NOT
accepted as done without independent e2e on **real** provider
evidence, or it is explicitly reported as **blocked** on its owner
gate. Recorded-fixture green is "offline-ready", never "live done".

## 7. Amendment need and AC-EXT-1

- **A formal amendment IS required for the Live-default direction**
  (Live as the production default with fixtures behind `?dev=1`
  supersedes the simulated-first demo boundary of ASM-002/003).
  It is prepared for plan review as `SPEC_IMPACT_LIVE.md`
  alongside this roadmap. The offline slices (L1–L3, S4) need no
  amendment: they wire adapters behind existing ports.
- **AC-EXT-1 preserved**: routing/places/desktop work lives in
  `src/adapters/**`, `src/plugins/**`, and `src/ui/**`;
  `git diff f43c6c1d -- src/core` stays empty; no new baseline.

## 8. Exact owner authorizations needed (minimal)

1. **G-ROUTE**: choose the routing provider (accept OSRM
   demo-server limits, or register an OpenRouteService free key)
   and accept its ToS + any cost cap.
2. **Places**: confirm Overpass/OSM as the live path (P-LOC
   lineage: coordinate disclosure), or authorize Google Places
   billing (P-BILL).
3. **Tiles**: accept OSM tile usage policy / chosen tile provider
   terms for the map render.
4. **G-LIVE-RUN**: one authorized real-run session (device location
   consent) to produce the independent real-provider e2e evidence.
5. **Visual sign-off**: per-viewport mockup comparison approval
   (the Architect cannot view the mockup).
